/**
 * Store-and-forward gossip layer.
 *
 *  • Every received packet is checked against a rotating Bloom filter; if
 *    we've seen its packetId before, drop.
 *  • Otherwise we deliver locally if the recipient matches us, then re-broadcast
 *    to all other connected transports with TTL-1 (until TTL reaches 0).
 *  • Packets addressed to peers we are NOT currently connected to are stored
 *    (Bitchat-style "store and forward") for up to STORE_TTL_MS so the next
 *    peer that connects can pick them up.
 */
import {RotatingBloom} from './bloom';
import {
  MeshPacket,
  PacketFlag,
  PacketType,
  ZERO_PEER,
  encodePacket,
  relayPacket,
} from './packet';

export interface DeliveredPacket {
  packet: MeshPacket;
  receivedAtMs: number;
  /** Total hops the packet took to reach us (path length minus 1). */
  hopCount: number;
  /** Approx end-to-end latency in ms (now - timestampMs). */
  latencyMs: number;
}

export interface GossipDelegate {
  /** Local peer ID for this node (8-byte hex). */
  localPeerId: string;
  /** Send raw bytes on every transport that is _not_ the source link. */
  broadcast: (payload: Uint8Array, exceptLinkId?: string) => void;
  /** Deliver a packet up the stack (already deduped). */
  deliver: (delivered: DeliveredPacket) => void;
  /** Emit a diagnostic line (PEER_CONNECTED, PACKET_RELAYED, etc). */
  diag: (event: string, fields?: Record<string, unknown>) => void;
}

const STORE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const STORE_MAX = 1024;

interface StoredPacket {
  packet: MeshPacket;
  expiresAt: number;
}

export class GossipRouter {
  private seen = new RotatingBloom();
  private store: StoredPacket[] = [];

  constructor(private readonly delegate: GossipDelegate) {}

  /** Inject a freshly-received packet from a transport. */
  ingest(packet: MeshPacket, fromLinkId?: string): void {
    if (this.seen.has(packet.packetId)) {
      this.delegate.diag('PACKET_DUPLICATE', {
        id: packet.packetId.slice(0, 8),
        from: fromLinkId,
      });
      return;
    }
    this.seen.add(packet.packetId);

    const me = this.delegate.localPeerId;
    const isForUs =
      packet.recipientId === me || packet.recipientId === ZERO_PEER;

    if (isForUs) {
      const hopCount = Math.max(0, packet.path.length - 1);
      this.delegate.deliver({
        packet,
        receivedAtMs: Date.now(),
        hopCount,
        latencyMs: Math.max(0, Date.now() - packet.timestampMs),
      });
      this.delegate.diag('PACKET_DELIVERED', {
        id: packet.packetId.slice(0, 8),
        type: PacketType[packet.type],
        hops: hopCount,
      });
    }

    // Forward (store-and-forward) unless this is a unicast that has reached us.
    const shouldForward =
      packet.ttl > 1 && (packet.recipientId !== me || packet.recipientId === ZERO_PEER);

    if (shouldForward) {
      const relayed = relayPacket(packet, me);
      this.delegate.broadcast(encodePacket(relayed), fromLinkId);
      this.delegate.diag('PACKET_RELAYED', {
        id: packet.packetId.slice(0, 8),
        ttl: relayed.ttl,
        hops: relayed.path.length,
      });
    } else if (packet.recipientId !== me && packet.recipientId !== ZERO_PEER) {
      this.archive(packet);
    }
  }

  /** Send a fresh packet from the local node onto the mesh. */
  emit(packet: MeshPacket): void {
    this.seen.add(packet.packetId);
    this.delegate.broadcast(encodePacket(packet));
    this.delegate.diag('PACKET_EMIT', {
      id: packet.packetId.slice(0, 8),
      to: packet.recipientId,
      type: PacketType[packet.type],
    });
  }

  /** When a new peer comes online, replay any stored packets bound for them. */
  flushFor(peerId: string): MeshPacket[] {
    const now = Date.now();
    const remaining: StoredPacket[] = [];
    const flushed: MeshPacket[] = [];
    for (const s of this.store) {
      if (s.expiresAt < now) continue;
      if (s.packet.recipientId === peerId) {
        flushed.push(s.packet);
      } else {
        remaining.push(s);
      }
    }
    this.store = remaining;
    if (flushed.length) {
      this.delegate.diag('STORE_FLUSHED', {peer: peerId, count: flushed.length});
    }
    return flushed;
  }

  storeStats() {
    return {
      stored: this.store.length,
      seen: this.seen.size(),
    };
  }

  private archive(p: MeshPacket) {
    if ((p.flags & PacketFlag.REQUIRES_ACK) === 0) return;
    if (this.store.length >= STORE_MAX) {
      this.store.shift();
    }
    this.store.push({packet: p, expiresAt: Date.now() + STORE_TTL_MS});
    this.delegate.diag('PACKET_STORED', {
      id: p.packetId.slice(0, 8),
      to: p.recipientId,
    });
  }
}
