/**
 * Noise Protocol Framework — XX pattern (Noise_XX_25519_AESGCM_SHA256).
 *
 * Implements mutual-authentication 1-RTT-ish handshake between two peers
 * over an unauthenticated mesh transport. After the handshake completes,
 * each side holds a pair of ChaCha-style send/recv ciphers (here AES-256-GCM
 * per the project spec) keyed by the handshake transcript.
 *
 * Wire format (per Noise spec):
 *   -> e
 *   <- e, ee, s, es
 *   -> s, se
 *
 * References:
 *   • https://noiseprotocol.org/noise.html  (Rev 34)
 *   • Bitchat protocol whitepaper (Noise_XX over BLE).
 *
 * Note: this is a from-scratch educational implementation tuned for clarity
 * and offline-friendliness. It uses @noble primitives for the heavy lifting
 * and is deterministic / side-effect free.
 */
import {x25519} from '@noble/curves/ed25519';
import {gcm} from '@noble/ciphers/aes';
import {sha256} from '@noble/hashes/sha256';
import {hkdf} from '@noble/hashes/hkdf';
import {randomBytes} from '@noble/hashes/utils';

const PROTOCOL_NAME = 'Noise_XX_25519_AESGCM_SHA256';
const HASHLEN = 32;
const DHLEN = 32;
const KEYLEN = 32;

const EMPTY = new Uint8Array(0);

function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

function hkdfNoise(
  chainingKey: Uint8Array,
  inputKeyMaterial: Uint8Array,
  numOutputs: 2 | 3,
): Uint8Array[] {
  // Noise HKDF: salt = chainingKey, ikm = inputKeyMaterial.
  const okm = hkdf(sha256, inputKeyMaterial, chainingKey, EMPTY, HASHLEN * numOutputs);
  const out: Uint8Array[] = [];
  for (let i = 0; i < numOutputs; i++) {
    out.push(okm.slice(i * HASHLEN, (i + 1) * HASHLEN));
  }
  return out;
}

/** 96-bit nonce per Noise spec: 4 bytes zero || 8 bytes LE counter. */
function nonceBytes(n: bigint): Uint8Array {
  const out = new Uint8Array(12);
  const view = new DataView(out.buffer);
  view.setBigUint64(4, n, true);
  return out;
}

/** A symmetric AEAD state with a counter, used after the handshake. */
export class CipherState {
  private k: Uint8Array | null;
  private n: bigint = 0n;

  constructor(k: Uint8Array | null) {
    this.k = k;
  }

  hasKey() {
    return this.k !== null;
  }

  encryptWithAd(ad: Uint8Array, plaintext: Uint8Array): Uint8Array {
    if (!this.k) return plaintext;
    const ct = gcm(this.k, nonceBytes(this.n), ad).encrypt(plaintext);
    this.n += 1n;
    return ct;
  }

  decryptWithAd(ad: Uint8Array, ciphertext: Uint8Array): Uint8Array {
    if (!this.k) return ciphertext;
    const pt = gcm(this.k, nonceBytes(this.n), ad).decrypt(ciphertext);
    this.n += 1n;
    return pt;
  }
}

class SymmetricState {
  ck: Uint8Array;
  h: Uint8Array;
  cs: CipherState = new CipherState(null);

  constructor() {
    const name = new TextEncoder().encode(PROTOCOL_NAME);
    if (name.length <= HASHLEN) {
      this.h = new Uint8Array(HASHLEN);
      this.h.set(name, 0);
    } else {
      this.h = sha256(name);
    }
    this.ck = this.h.slice();
  }

  mixKey(input: Uint8Array) {
    const [ck, tempK] = hkdfNoise(this.ck, input, 2);
    this.ck = ck;
    this.cs = new CipherState(tempK.slice(0, KEYLEN));
  }

  mixHash(data: Uint8Array) {
    this.h = sha256(concat(this.h, data));
  }

  encryptAndHash(plaintext: Uint8Array): Uint8Array {
    const ct = this.cs.encryptWithAd(this.h, plaintext);
    this.mixHash(ct);
    return ct;
  }

  decryptAndHash(ciphertext: Uint8Array): Uint8Array {
    const pt = this.cs.decryptWithAd(this.h, ciphertext);
    this.mixHash(ciphertext);
    return pt;
  }

  split(): {send: CipherState; recv: CipherState} {
    const [k1, k2] = hkdfNoise(this.ck, EMPTY, 2);
    return {
      send: new CipherState(k1.slice(0, KEYLEN)),
      recv: new CipherState(k2.slice(0, KEYLEN)),
    };
  }
}

export interface HandshakeKeys {
  staticPriv: Uint8Array;
  staticPub: Uint8Array;
}

export interface NoiseSession {
  send: CipherState;
  recv: CipherState;
  remoteStatic: Uint8Array;
  handshakeHash: Uint8Array;
}

/**
 * Stateful XX initiator: writes -> e, processes <- e,ee,s,es, writes -> s,se.
 */
export class NoiseInitiator {
  private state = new SymmetricState();
  private staticPriv: Uint8Array;
  private staticPub: Uint8Array;
  private ePriv!: Uint8Array;
  private ePub!: Uint8Array;
  private remoteE?: Uint8Array;
  private remoteS?: Uint8Array;
  private session?: NoiseSession;

  constructor(keys: HandshakeKeys, prologue: Uint8Array = EMPTY) {
    this.staticPriv = keys.staticPriv;
    this.staticPub = keys.staticPub;
    this.state.mixHash(prologue);
  }

  /** -> e */
  writeMessage1(): Uint8Array {
    this.ePriv = randomBytes(32);
    this.ePub = x25519.getPublicKey(this.ePriv);
    this.state.mixHash(this.ePub);
    // No key yet → encryptAndHash returns plaintext (empty payload).
    const empty = this.state.encryptAndHash(EMPTY);
    return concat(this.ePub, empty);
  }

  /** <- e, ee, s, es */
  readMessage2(message: Uint8Array): void {
    let offset = 0;
    this.remoteE = message.slice(offset, offset + DHLEN);
    offset += DHLEN;
    this.state.mixHash(this.remoteE);

    this.state.mixKey(x25519.getSharedSecret(this.ePriv, this.remoteE));

    // s is encrypted (DHLEN + 16 tag)
    const sCt = message.slice(offset, offset + DHLEN + 16);
    offset += DHLEN + 16;
    this.remoteS = this.state.decryptAndHash(sCt);

    this.state.mixKey(x25519.getSharedSecret(this.ePriv, this.remoteS));

    // empty encrypted payload
    const remaining = message.slice(offset);
    this.state.decryptAndHash(remaining);
  }

  /** -> s, se */
  writeMessage3(): {message: Uint8Array; session: NoiseSession} {
    const sCt = this.state.encryptAndHash(this.staticPub);
    this.state.mixKey(x25519.getSharedSecret(this.staticPriv, this.remoteE!));
    const empty = this.state.encryptAndHash(EMPTY);

    const {send, recv} = this.state.split();
    this.session = {
      send,
      recv,
      remoteStatic: this.remoteS!,
      handshakeHash: this.state.h.slice(),
    };
    return {message: concat(sCt, empty), session: this.session};
  }

  getSession(): NoiseSession {
    if (!this.session) throw new Error('Handshake not complete');
    return this.session;
  }
}

/**
 * Stateful XX responder: reads -> e, writes <- e,ee,s,es, reads -> s,se.
 */
export class NoiseResponder {
  private state = new SymmetricState();
  private staticPriv: Uint8Array;
  private staticPub: Uint8Array;
  private ePriv!: Uint8Array;
  private ePub!: Uint8Array;
  private remoteE?: Uint8Array;
  private remoteS?: Uint8Array;
  private session?: NoiseSession;

  constructor(keys: HandshakeKeys, prologue: Uint8Array = EMPTY) {
    this.staticPriv = keys.staticPriv;
    this.staticPub = keys.staticPub;
    this.state.mixHash(prologue);
  }

  /** <- e */
  readMessage1(message: Uint8Array): void {
    this.remoteE = message.slice(0, DHLEN);
    this.state.mixHash(this.remoteE);
    // Empty payload, no key yet → decryptAndHash is a no-op on empty.
    this.state.decryptAndHash(message.slice(DHLEN));
  }

  /** -> e, ee, s, es */
  writeMessage2(): Uint8Array {
    this.ePriv = randomBytes(32);
    this.ePub = x25519.getPublicKey(this.ePriv);
    this.state.mixHash(this.ePub);

    this.state.mixKey(x25519.getSharedSecret(this.ePriv, this.remoteE!));
    const sCt = this.state.encryptAndHash(this.staticPub);
    this.state.mixKey(x25519.getSharedSecret(this.staticPriv, this.remoteE!));
    const empty = this.state.encryptAndHash(EMPTY);

    return concat(this.ePub, sCt, empty);
  }

  /** <- s, se */
  readMessage3(message: Uint8Array): NoiseSession {
    let offset = 0;
    const sCt = message.slice(offset, offset + DHLEN + 16);
    offset += DHLEN + 16;
    this.remoteS = this.state.decryptAndHash(sCt);
    this.state.mixKey(x25519.getSharedSecret(this.ePriv, this.remoteS));
    this.state.decryptAndHash(message.slice(offset));

    const {send, recv} = this.state.split();
    // Per Noise XX, responder swaps send/recv so that "send" matches
    // initiator's "recv" and vice-versa.
    this.session = {
      send: recv,
      recv: send,
      remoteStatic: this.remoteS!,
      handshakeHash: this.state.h.slice(),
    };
    return this.session;
  }
}

/**
 * Convenience helper that runs the entire XX handshake in memory between two
 * local parties — used for unit tests and for the in-app simulator that wires
 * the radar/diagnostics views without real transports.
 */
export function runHandshake(
  initiatorKeys: HandshakeKeys,
  responderKeys: HandshakeKeys,
): {initiator: NoiseSession; responder: NoiseSession} {
  const init = new NoiseInitiator(initiatorKeys);
  const resp = new NoiseResponder(responderKeys);

  const m1 = init.writeMessage1();
  resp.readMessage1(m1);
  const m2 = resp.writeMessage2();
  init.readMessage2(m2);
  const {message: m3, session: initiator} = init.writeMessage3();
  const responder = resp.readMessage3(m3);
  return {initiator, responder};
}
