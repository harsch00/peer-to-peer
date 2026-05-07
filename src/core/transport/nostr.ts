/**
 * Nostr gateway transport.
 *
 * When a node has internet but no local mesh peers, it can use a public Nostr
 * relay as a global "carrier wave" to reach other p2p-mesh nodes. We use a
 * dedicated Nostr event kind (30078, parameterized replaceable) with the
 * raw Bitchat packet bytes encoded in its `content` field as base64.
 *
 * We deliberately avoid the `nostr-tools` dep here so the transport is light
 * and works in any RN environment with WebSocket. Only the bare-minimum
 * NIP-01 wire format is used; signing keys are independent of the mesh
 * identity (ephemeral and per-session) for unlinkability.
 */
import {schnorr} from '@noble/curves/secp256k1';
import {sha256} from '@noble/hashes/sha256';
import {bytesToHex, hexToBytes, randomBytes} from '@noble/hashes/utils';
import type {MeshTransport, PeerLink, TransportEvents} from './types';
import {decodePacket} from '../protocol/packet';
import {useDiagnosticsStore} from '../../state/diagnosticsStore';

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
];

const KIND_MESH = 20001; // NIP-16 ephemeral; not stored by relays
const TAG = 'p2p-mesh';

export interface NostrConfig {
  relays?: string[];
  /** Topic / room tag used to filter events (defaults to global channel). */
  channel?: string;
}

export class NostrTransport implements MeshTransport {
  readonly id = 'nostr' as const;
  readonly displayName = 'Nostr (Internet Gateway)';

  private sockets: WebSocket[] = [];
  private events?: TransportEvents;
  private privKey = randomBytes(32);
  private pubKey: string;
  private cfg: Required<NostrConfig>;
  private linkMap = new Map<string, PeerLink>();

  constructor(cfg: NostrConfig = {}) {
    this.cfg = {
      relays: cfg.relays ?? DEFAULT_RELAYS,
      channel: cfg.channel ?? 'global',
    };
    this.pubKey = bytesToHex(schnorr.getPublicKey(this.privKey));
  }

  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    this.cfg.relays.forEach(url => this.connectRelay(url));
  }

  private connectRelay(url: string) {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }

    ws.onopen = () => {
      this.diag('info', 'NOSTR_RELAY_CONNECTED', {url});
      const subId = `p2p-${Math.floor(Math.random() * 1e9).toString(36)}`;
      ws.send(
        JSON.stringify([
          'REQ',
          subId,
          {
            kinds: [KIND_MESH],
            '#t': [TAG],
            since: Math.floor(Date.now() / 1000) - 60,
          },
        ]),
      );
    };
    ws.onclose = () => {
      this.diag('warn', 'NOSTR_RELAY_DISCONNECTED', {url});
      // Naive auto-reconnect after 10s.
      setTimeout(() => this.connectRelay(url), 10_000);
    };
    ws.onerror = () => {
      this.diag('error', 'NOSTR_RELAY_ERROR', {url});
    };
    ws.onmessage = ev => {
      try {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
        if (Array.isArray(msg) && msg[0] === 'EVENT' && msg[2]) {
          const event = msg[2];
          if (event.pubkey === this.pubKey) return; // ignore loopback
          const bytes = base64ToBytes(event.content);
          const packet = decodePacket(bytes);
          if (packet.senderId === '0000000000000000') return;
          const linkId = `nostr:${packet.senderId}`;
          this.upsertPeerLink(linkId, packet.senderId);
          this.events?.onPacket(linkId, bytes);
        }
      } catch (e) {
        this.diag('warn', 'NOSTR_EVENT_IGNORED', {error: String(e)});
      }
    };
    this.sockets.push(ws);
  }

  async stop(): Promise<void> {
    this.sockets.forEach(s => {
      try {
        s.close();
      } catch {
        // ignore
      }
    });
    this.sockets = [];
    this.linkMap.clear();
  }

  async send(linkId: string, bytes: Uint8Array): Promise<void> {
    // Nostr is broadcast-only; per-link send falls back to broadcast.
    return this.broadcast(bytes);
  }

  async broadcast(bytes: Uint8Array): Promise<void> {
    const event = await this.signEvent({
      kind: KIND_MESH,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', TAG],
        ['t', this.cfg.channel],
      ],
      content: bytesToBase64(bytes),
    });
    const frame = JSON.stringify(['EVENT', event]);
    this.sockets.forEach(s => {
      if (s.readyState === 1) s.send(frame);
    });
  }

  links(): PeerLink[] {
    return [...this.linkMap.values()];
  }

  // --- minimal NIP-01 signing ---

  private async signEvent(e: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }) {
    const serialized = JSON.stringify([0, this.pubKey, e.created_at, e.kind, e.tags, e.content]);
    const id = bytesToHex(sha256(new TextEncoder().encode(serialized)));
    const sig = bytesToHex(schnorr.sign(hexToBytes(id), this.privKey));
    return {id, pubkey: this.pubKey, sig, ...e};
  }

  private upsertPeerLink(linkId: string, peerId: string) {
    const existing = this.linkMap.get(linkId);
    if (existing) {
      existing.lastSeenMs = Date.now();
      existing.secured = true;
      this.events?.onRssi(linkId, existing.rssi);
      return;
    }
    const link: PeerLink = {
      linkId,
      peerId,
      transport: 'nostr',
      rssi: 0,
      secured: true,
      lastSeenMs: Date.now(),
      reliability: 1,
    };
    this.linkMap.set(linkId, link);
    this.events?.onLinkUp(link);
  }

  private diag(level: 'info' | 'warn' | 'error', event: string, fields?: Record<string, unknown>) {
    useDiagnosticsStore.getState().push({ts: Date.now(), level, event, fields});
  }
}

function bytesToBase64(b: Uint8Array): string {
  if (typeof (globalThis as any).btoa === 'function') {
    let bin = '';
    for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return (globalThis as any).btoa(bin);
  }
  return (globalThis as any).Buffer.from(b).toString('base64');
}

function base64ToBytes(s: string): Uint8Array {
  if (typeof (globalThis as any).atob === 'function') {
    const bin = (globalThis as any).atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array((globalThis as any).Buffer.from(s, 'base64'));
}
