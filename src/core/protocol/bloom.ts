/**
 * Optimized Bloom filter for packet-ID dedup.
 *
 * Used by every node to remember which packetIds it has already forwarded so
 * gossip can't loop. We size the filter for ~10k entries at p=0.001:
 *   m = -(n * ln(p)) / (ln(2)^2) ≈ 143776 bits  → 17972 bytes
 *   k = (m/n) * ln(2) ≈ 10 hashes
 *
 * To keep hashing cheap on RN we use a double-hash trick with two FNV-1a
 * variants: h_i(x) = h1(x) + i * h2(x). This is the Kirsch-Mitzenmacher
 * optimization.
 */
export interface BloomConfig {
  bits: number;
  hashes: number;
  capacity: number;
}

export const DEFAULT_BLOOM: BloomConfig = {
  bits: 144 * 1024,
  hashes: 10,
  capacity: 10_000,
};

export class BloomFilter {
  private bits: Uint8Array;
  private inserted = 0;
  readonly config: BloomConfig;

  constructor(config: BloomConfig = DEFAULT_BLOOM) {
    this.config = config;
    this.bits = new Uint8Array(Math.ceil(config.bits / 8));
  }

  add(key: string): void {
    const [h1, h2] = this.doubleHash(key);
    for (let i = 0; i < this.config.hashes; i++) {
      const idx = (h1 + i * h2) % this.config.bits;
      this.bits[idx >>> 3] |= 1 << (idx & 7);
    }
    this.inserted++;
  }

  has(key: string): boolean {
    const [h1, h2] = this.doubleHash(key);
    for (let i = 0; i < this.config.hashes; i++) {
      const idx = (h1 + i * h2) % this.config.bits;
      if (!(this.bits[idx >>> 3] & (1 << (idx & 7)))) {
        return false;
      }
    }
    return true;
  }

  /** Reset the filter (e.g. when load reaches capacity). */
  reset() {
    this.bits.fill(0);
    this.inserted = 0;
  }

  /** Approximate false-positive rate at current load. */
  estimatedFpr(): number {
    const k = this.config.hashes;
    const m = this.config.bits;
    const n = this.inserted;
    return Math.pow(1 - Math.exp(-k * n / m), k);
  }

  size() {
    return this.inserted;
  }

  private doubleHash(key: string): [number, number] {
    // FNV-1a 32-bit
    let h1 = 0x811c9dc5 | 0;
    let h2 = 0x01000193 | 0;
    for (let i = 0; i < key.length; i++) {
      const c = key.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= (c + i) & 0xff;
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    h1 = (h1 >>> 0);
    h2 = (h2 >>> 0) || 1; // never zero
    return [h1, h2];
  }
}

/**
 * A counted bloom filter wrapper that auto-resets when its FPR would exceed
 * the target. Used by the gossip layer to avoid permanent state growth.
 */
export class RotatingBloom {
  private a: BloomFilter;
  private b: BloomFilter;
  private active: 'a' | 'b' = 'a';
  private fprTarget: number;

  constructor(config: BloomConfig = DEFAULT_BLOOM, fprTarget = 0.005) {
    this.a = new BloomFilter(config);
    this.b = new BloomFilter(config);
    this.fprTarget = fprTarget;
  }

  has(key: string): boolean {
    return this.a.has(key) || this.b.has(key);
  }

  add(key: string) {
    const cur = this.active === 'a' ? this.a : this.b;
    cur.add(key);
    if (cur.estimatedFpr() > this.fprTarget) {
      // rotate: move old window to the other slot
      if (this.active === 'a') {
        this.b.reset();
        this.active = 'b';
      } else {
        this.a.reset();
        this.active = 'a';
      }
    }
  }

  size() {
    return this.a.size() + this.b.size();
  }
}
