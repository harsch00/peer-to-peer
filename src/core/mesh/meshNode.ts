/**
 * MeshNode — the top-level orchestrator.
 *
 * Responsibilities:
 *   1. Hold the local cryptographic identity.
 *   2. Drive the Noise XX handshake on every newly-discovered link.
 *   3. Encrypt/decrypt application packets through the Noise CipherStates.
 *   4. Run gossip (store-and-forward) over the transport fabric.
 *   5. Surface events (peers, messages, diagnostics, RSSI) to the UI store.
 */
import {bytesToHex, randomBytes} from '@noble/hashes/utils';
import {sha256} from '@noble/hashes/sha256';
import {TinyEmitter} from '../../utils/emitter';
import {NoiseInitiator, NoiseResponder, NoiseSession} from '../crypto/noise';
import {generateIdentity, identityFromPrivate, PeerIdentity} from '../crypto/identity';
import {GossipRouter, DeliveredPacket} from '../protocol/gossip';
import {
  MeshPacket,
  PacketFlag,
  PacketType,
  ZERO_PEER,
  createPacket,
  decodePacket,
  encodePacket,
  newPacketId,
} from '../protocol/packet';
import {
  ChatPayload,
  decodeMessagePayload,
  encodeMessagePayload,
  payloadPreview,
} from '../protocol/messageEnvelope';
import {TransportManager} from '../transport/transportManager';
import type {PeerLink} from '../transport/types';
import {usePeerDirectoryStore} from '../../state/peerDirectoryStore';

/** Map a remote static public key to the canonical 8-byte peer ID. */
function peerIdFromPublicKey(pk: Uint8Array): string {
  return bytesToHex(sha256(pk).slice(0, 8));
}

export interface MessageReaction {
  emoji: string;
  fromPeerId: string;
}

export interface ChatMessage {
  id: string;
  fromPeerId: string;
  toPeerId: string;
  body: string;
  payload: ChatPayload;
  receivedAtMs: number;
  hopCount: number;
  latencyMs: number;
  path: string[];
  delivered: boolean;
  /** Aggregated on clients — not sent as a standalone chat row. */
  reactions?: MessageReaction[];
  /** Poll option id per voting peer (from `poll_vote` payloads), latest wins. */
  pollVotes?: Record<string, string>;
}

export interface DiagEvent {
  ts: number;
  level: 'info' | 'warn' | 'error';
  event: string;
  fields?: Record<string, unknown>;
}

export interface MeshState {
  identity: PeerIdentity;
  peers: Map<string, PeerLink>;
  sessions: Map<string, NoiseSession>;
  diag: DiagEvent[];
}

type Listener<T> = (data: T) => void;

interface PendingHandshake {
  initiator?: NoiseInitiator;
  responder?: NoiseResponder;
  remoteLinkId?: string;
}

export class MeshNode {
  readonly identity: PeerIdentity;
  private readonly transport: TransportManager;
  private readonly gossip: GossipRouter;
  private readonly emitter = new TinyEmitter();
  private readonly sessions = new Map<string, NoiseSession>(); // peerId -> session
  private readonly handshakes = new Map<string, PendingHandshake>(); // linkId -> hs
  private readonly linkToPeer = new Map<string, string>(); // linkId -> peerId
  private readonly links = new Map<string, PeerLink>(); // linkId -> link
  private readonly diagBuffer: DiagEvent[] = [];
  private readonly maxDiag = 500;
  private announceTimer?: ReturnType<typeof setInterval>;

  constructor(transport: TransportManager, identity?: PeerIdentity) {
    this.identity = identity ?? generateIdentity();
    this.transport = transport;
    this.gossip = new GossipRouter({
      localPeerId: this.identity.peerId,
      broadcast: (bytes, exceptLinkId) =>
        this.transport.broadcast(bytes, exceptLinkId),
      deliver: delivered => this.handleDelivered(delivered),
      diag: (event, fields) => this.diag('info', event, fields),
    });
  }

  static fromPrivateKey(transport: TransportManager, privateKey: Uint8Array) {
    return new MeshNode(transport, identityFromPrivate(privateKey));
  }

  async start() {
    await this.transport.start({
      onLinkUp: link => this.onLinkUp(link),
      onLinkDown: link => this.onLinkDown(link),
      onPacket: (linkId, bytes) => this.onPacket(linkId, bytes),
      onRssi: (linkId, rssi) => this.onRssi(linkId, rssi),
      onLinks: links => this.emitter.emit('links', links),
    });
    this.diag('info', 'NODE_STARTED', {peerId: this.identity.peerId});
    this.announcePresence();
    this.announceTimer = setInterval(() => this.announcePresence(), 5_000);
  }

  async stop() {
    if (this.announceTimer) clearInterval(this.announceTimer);
    await this.transport.stop();
    this.diag('info', 'NODE_STOPPED');
  }

  /**
   * Run a one-shot BLE discovery diagnostic (Pulse screen). Delegates to BLE transport when present.
   */
  async runBleDiscoveryProbe(): Promise<string[]> {
    const ble = this.transport.getById('ble');
    if (ble?.runDiscoveryDiagnostics) {
      return ble.runDiscoveryDiagnostics();
    }
    return ['BLE transport is not registered in this build.'];
  }

  // ---------- public API ----------

  async sendChatMessage(toPeerId: string, body: string): Promise<ChatMessage> {
    return this.sendChatPayload(toPeerId, {kind: 'text', text: body});
  }

  async sendChatPayload(toPeerId: string, payload: ChatPayload): Promise<ChatMessage> {
    const session = this.sessions.get(toPeerId);
    if (!session) {
      throw new Error(`no secure session with ${toPeerId}`);
    }
    const cipher = session.send.encryptWithAd(
      new TextEncoder().encode(toPeerId),
      encodeMessagePayload(payload),
    );
    const packet = createPacket({
      type: PacketType.ENCRYPTED_MSG,
      senderId: this.identity.peerId,
      recipientId: toPeerId,
      payload: cipher,
      flags: PacketFlag.REQUIRES_ACK,
    });
    this.gossip.emit(packet);
    const msg: ChatMessage = {
      id: packet.packetId,
      fromPeerId: this.identity.peerId,
      toPeerId,
      body: payloadPreview(payload),
      payload,
      receivedAtMs: Date.now(),
      hopCount: 0,
      latencyMs: 0,
      path: [this.identity.peerId],
      delivered: true, // optimistically; ACK will confirm
    };
    this.emitter.emit('message', msg);
    return msg;
  }

  async sendBroadcast(body: string): Promise<void> {
    await this.sendBroadcastPayload({kind: 'text', text: body});
  }

  async sendBroadcastPayload(payload: ChatPayload): Promise<void> {
    const packet = createPacket({
      type: PacketType.GOSSIP_BROADCAST,
      senderId: this.identity.peerId,
      recipientId: ZERO_PEER,
      payload: encodeMessagePayload(payload),
      flags: PacketFlag.SIGNED,
    });
    this.gossip.emit(packet);
    // Profile beacons are not chat rows — skip local echo.
    if (payload.kind === 'peer_profile') {
      return;
    }
    const msg: ChatMessage = {
      id: packet.packetId,
      fromPeerId: this.identity.peerId,
      toPeerId: ZERO_PEER,
      body: payloadPreview(payload),
      payload,
      receivedAtMs: Date.now(),
      hopCount: 0,
      latencyMs: 0,
      path: [this.identity.peerId],
      delivered: true,
    };
    this.emitter.emit('message', msg);
  }

  /** Announce display name + avatar style on the mesh broadcast channel (signed gossip). */
  async broadcastPeerProfile(displayName: string, avatarStyle: string): Promise<void> {
    await this.sendBroadcastPayload({
      kind: 'peer_profile',
      displayName: displayName.trim().slice(0, 64),
      avatarStyle,
    });
  }

  on(event: 'message', cb: Listener<ChatMessage>): () => void;
  on(event: 'links', cb: Listener<PeerLink[]>): () => void;
  on(event: 'diag', cb: Listener<DiagEvent>): () => void;
  on(event: 'session', cb: Listener<{peerId: string; link: PeerLink}>): () => void;
  on(event: string, cb: (...args: any[]) => void): () => void {
    return this.emitter.on(event, cb);
  }

  snapshot(): MeshState {
    return {
      identity: this.identity,
      peers: new Map(this.links),
      sessions: new Map(this.sessions),
      diag: [...this.diagBuffer],
    };
  }

  // ---------- transport callbacks ----------

  private announcePresence() {
    try {
      const packet = createPacket({
        type: PacketType.PEER_ANNOUNCE,
        senderId: this.identity.peerId,
        recipientId: ZERO_PEER,
        payload: new TextEncoder().encode(
          JSON.stringify({
            peerId: this.identity.peerId,
            fingerprint: this.identity.fingerprint,
            ts: Date.now(),
          }),
        ),
        flags: PacketFlag.SIGNED,
      });
      this.gossip.emit(packet);
    } catch (e) {
      this.diag('warn', 'PEER_ANNOUNCE_FAILED', {error: String(e)});
    }
  }

  private onLinkUp(link: PeerLink) {
    this.links.set(link.linkId, link);
    this.diag('info', 'PEER_CONNECTED', {
      link: link.linkId,
      transport: link.transport,
      rssi: link.rssi,
    });
    // Initiate Noise XX handshake. Ties go to whichever side has the smaller
    // peerId, but for simplicity we always initiate on link-up.
    const init = new NoiseInitiator({
      staticPriv: this.identity.privateKey,
      staticPub: this.identity.publicKey,
    });
    const m1 = init.writeMessage1();
    this.handshakes.set(link.linkId, {initiator: init, remoteLinkId: link.linkId});
    const wrapped = this.wrapHandshake(PacketType.HANDSHAKE_INIT, m1);
    this.transport.sendToLink(link.linkId, wrapped).catch(() => {/* ignore */});
  }

  private onLinkDown(link: PeerLink) {
    this.links.delete(link.linkId);
    const peerId = this.linkToPeer.get(link.linkId);
    if (peerId) {
      this.linkToPeer.delete(link.linkId);
      this.sessions.delete(peerId);
    }
    this.handshakes.delete(link.linkId);
    this.diag('warn', 'PEER_DISCONNECTED', {
      link: link.linkId,
      peer: peerId ?? null,
    });
  }

  private onRssi(linkId: string, rssi: number) {
    const link = this.links.get(linkId);
    if (link) {
      link.rssi = rssi;
      link.lastSeenMs = Date.now();
    }
  }

  private async onPacket(linkId: string, bytes: Uint8Array) {
    let packet: MeshPacket;
    try {
      packet = decodePacket(bytes);
    } catch (e) {
      this.diag('error', 'PACKET_DECODE_FAILED', {link: linkId, error: String(e)});
      return;
    }

    switch (packet.type) {
      case PacketType.HANDSHAKE_INIT:
        this.handleHandshakeInit(linkId, packet);
        break;
      case PacketType.HANDSHAKE_RESP:
        this.handleHandshakeResp(linkId, packet);
        break;
      case PacketType.HANDSHAKE_FIN:
        this.handleHandshakeFin(linkId, packet);
        break;
      default:
        this.gossip.ingest(packet, linkId);
    }
  }

  // ---------- Noise handshake glue ----------

  private wrapHandshake(type: PacketType, body: Uint8Array): Uint8Array {
    const packet = createPacket({
      type,
      senderId: this.identity.peerId,
      recipientId: ZERO_PEER,
      payload: body,
      ttl: 1,
    });
    return encodePacket(packet);
  }

  private handleHandshakeInit(linkId: string, packet: MeshPacket) {
    const existing = this.handshakes.get(linkId);
    // Collision: both sides initiated. Tie-break by peer ID — the lower
    // ID wins the initiator role; the other side becomes responder.
    if (existing?.initiator) {
      if (this.identity.peerId < packet.senderId) {
        // Keep our initiator-side state; ignore their INIT.
        this.diag('warn', 'HANDSHAKE_TIEBREAK_KEEP_INITIATOR', {
          link: linkId,
          peer: packet.senderId,
        });
        return;
      }
      // Drop our initiator state and re-enter as responder.
      this.diag('warn', 'HANDSHAKE_TIEBREAK_BECOME_RESPONDER', {
        link: linkId,
        peer: packet.senderId,
      });
    }
    const responder = new NoiseResponder({
      staticPriv: this.identity.privateKey,
      staticPub: this.identity.publicKey,
    });
    responder.readMessage1(packet.payload);
    const m2 = responder.writeMessage2();
    this.handshakes.set(linkId, {responder});
    this.transport
      .sendToLink(linkId, this.wrapHandshake(PacketType.HANDSHAKE_RESP, m2))
      .catch(() => {/* ignore */});
  }

  private handleHandshakeResp(linkId: string, packet: MeshPacket) {
    const hs = this.handshakes.get(linkId);
    if (!hs?.initiator) return;
    hs.initiator.readMessage2(packet.payload);
    const {message: m3, session} = hs.initiator.writeMessage3();
    const peerId = peerIdFromPublicKey(session.remoteStatic);
    this.sessions.set(peerId, session);
    this.linkToPeer.set(linkId, peerId);
    const link = this.links.get(linkId);
    if (link) {
      link.peerId = peerId;
      link.secured = true;
    }
    this.handshakes.delete(linkId);
    this.transport
      .sendToLink(linkId, this.wrapHandshake(PacketType.HANDSHAKE_FIN, m3))
      .catch(() => {/* ignore */});
    this.diag('info', 'NOISE_HANDSHAKE_OK', {link: linkId, peer: peerId});
    if (link) this.emitter.emit('session', {peerId, link});
    this.replayStored(peerId);
  }

  private handleHandshakeFin(linkId: string, packet: MeshPacket) {
    const hs = this.handshakes.get(linkId);
    if (!hs?.responder) return;
    const session = hs.responder.readMessage3(packet.payload);
    const peerId = peerIdFromPublicKey(session.remoteStatic);
    this.sessions.set(peerId, session);
    this.linkToPeer.set(linkId, peerId);
    const link = this.links.get(linkId);
    if (link) {
      link.peerId = peerId;
      link.secured = true;
    }
    this.handshakes.delete(linkId);
    this.diag('info', 'NOISE_HANDSHAKE_OK', {link: linkId, peer: peerId});
    if (link) this.emitter.emit('session', {peerId, link});
    this.replayStored(peerId);
  }

  private replayStored(peerId: string) {
    const stored = this.gossip.flushFor(peerId);
    stored.forEach(p => this.transport.broadcast(encodePacket(p)));
  }

  private applyPeerProfile(senderId: string, payload: ChatPayload): boolean {
    if (payload.kind !== 'peer_profile') {
      return false;
    }
    usePeerDirectoryStore.getState().upsert(senderId, payload.displayName, payload.avatarStyle);
    return true;
  }

  private handleDelivered(d: DeliveredPacket) {
    const {packet} = d;
    if (packet.type === PacketType.ENCRYPTED_MSG) {
      const session = this.sessions.get(packet.senderId);
      if (!session) {
        this.diag('warn', 'NO_SESSION_FOR_MSG', {from: packet.senderId});
        return;
      }
      try {
        const plain = session.recv.decryptWithAd(
          new TextEncoder().encode(packet.recipientId),
          packet.payload,
        );
        const payload = decodeMessagePayload(plain);
        if (this.applyPeerProfile(packet.senderId, payload)) {
          return;
        }
        const msg: ChatMessage = {
          id: packet.packetId,
          fromPeerId: packet.senderId,
          toPeerId: packet.recipientId,
          body: payloadPreview(payload),
          payload,
          receivedAtMs: d.receivedAtMs,
          hopCount: d.hopCount,
          latencyMs: d.latencyMs,
          path: packet.path,
          delivered: true,
        };
        this.emitter.emit('message', msg);
        if (packet.flags & PacketFlag.REQUIRES_ACK) {
          this.sendAck(packet);
        }
      } catch (e) {
        this.diag('error', 'DECRYPT_FAILED', {from: packet.senderId, err: String(e)});
      }
    } else if (packet.type === PacketType.GOSSIP_BROADCAST) {
      const payload = decodeMessagePayload(packet.payload);
      if (this.applyPeerProfile(packet.senderId, payload)) {
        return;
      }
      const msg: ChatMessage = {
        id: packet.packetId,
        fromPeerId: packet.senderId,
        toPeerId: ZERO_PEER,
        body: payloadPreview(payload),
        payload,
        receivedAtMs: d.receivedAtMs,
        hopCount: d.hopCount,
        latencyMs: d.latencyMs,
        path: packet.path,
        delivered: true,
      };
      this.emitter.emit('message', msg);
    }
  }

  private sendAck(original: MeshPacket) {
    const ack = createPacket({
      type: PacketType.ACK,
      senderId: this.identity.peerId,
      recipientId: original.senderId,
      payload: new TextEncoder().encode(original.packetId),
      packetId: newPacketId(),
      ttl: 4,
    });
    this.gossip.emit(ack);
  }

  // ---------- diagnostics ----------

  private diag(level: DiagEvent['level'], event: string, fields?: Record<string, unknown>) {
    const e: DiagEvent = {ts: Date.now(), level, event, fields};
    this.diagBuffer.push(e);
    if (this.diagBuffer.length > this.maxDiag) this.diagBuffer.shift();
    this.emitter.emit('diag', e);
  }
}

// Re-exports for convenience.
export {randomBytes};
