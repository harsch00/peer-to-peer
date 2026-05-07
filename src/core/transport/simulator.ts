/**
 * In-app mesh simulator.
 *
 * When the app runs without real radios (desktop dev, Android emulator with no
 * Wi-Fi P2P, etc.) we still want to demo the radar, gossip, and chat. The
 * simulator spawns a configurable number of synthetic peers, periodically
 * jitters their RSSI, randomly drops links, and forwards packets between
 * them through a virtual graph.
 *
 * It implements `MeshTransport` so `TransportManager` cannot tell it apart
 * from a real link.
 */
import type {MeshTransport, PeerLink, TransportEvents} from './types';
import {bytesToHex, randomBytes} from '@noble/hashes/utils';

interface SimPeer {
  link: PeerLink;
  /** Random walk anchor for the radar visualization. */
  angle: number;
  distance: number;
}

export interface SimulatorConfig {
  /** Number of synthetic peers to keep alive. */
  peerCount?: number;
  /** Average RSSI dBm; jittered around this value. */
  rssi?: number;
  /** ms between churn events (peer up / down). */
  churnIntervalMs?: number;
}

export class SimulatorTransport implements MeshTransport {
  readonly id = 'sim' as const;
  readonly displayName = 'Mesh Simulator';

  private events?: TransportEvents;
  private peers = new Map<string, SimPeer>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private cfg: Required<SimulatorConfig>;

  constructor(cfg: SimulatorConfig = {}) {
    this.cfg = {
      peerCount: cfg.peerCount ?? 5,
      rssi: cfg.rssi ?? -55,
      churnIntervalMs: cfg.churnIntervalMs ?? 8000,
    };
  }

  async start(events: TransportEvents) {
    this.events = events;
    for (let i = 0; i < this.cfg.peerCount; i++) {
      this.spawnPeer();
    }
    this.timers.push(
      setInterval(() => this.jitterRssi(), 1500),
      setInterval(() => this.churn(), this.cfg.churnIntervalMs),
    );
  }

  async stop() {
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];
    this.peers.forEach(p => this.events?.onLinkDown(p.link));
    this.peers.clear();
  }

  async send(linkId: string, bytes: Uint8Array): Promise<void> {
    // Echo the packet back as if a remote peer relayed it. This keeps the
    // gossip + diagnostic UI lively without needing real radios.
    setTimeout(() => {
      this.events?.onPacket(linkId, bytes);
    }, 30 + Math.random() * 70);
  }

  async broadcast(bytes: Uint8Array, exceptLinkId?: string): Promise<void> {
    [...this.peers.values()].forEach(p => {
      if (p.link.linkId === exceptLinkId) return;
      // 90% success rate to mimic real packet loss.
      if (Math.random() > 0.9) return;
      setTimeout(() => {
        this.events?.onPacket(p.link.linkId, bytes);
      }, 20 + Math.random() * 80);
    });
  }

  links(): PeerLink[] {
    return [...this.peers.values()].map(p => p.link);
  }

  // --- internals ---

  private spawnPeer() {
    const linkId = `sim:${bytesToHex(randomBytes(4))}`;
    const link: PeerLink = {
      linkId,
      // No peerId yet — populated by MeshNode on Noise handshake completion.
      peerId: bytesToHex(randomBytes(8)),
      transport: 'sim',
      rssi: this.cfg.rssi + (Math.random() * 20 - 10),
      secured: false,
      lastSeenMs: Date.now(),
      reliability: 0.85 + Math.random() * 0.15,
    };
    this.peers.set(linkId, {
      link,
      angle: Math.random() * Math.PI * 2,
      distance: 0.4 + Math.random() * 0.6,
    });
    this.events?.onLinkUp(link);
    // Mark "secured" after a brief delay so the UI animates the handshake.
    setTimeout(() => {
      link.secured = true;
      link.lastSeenMs = Date.now();
      this.events?.onRssi(link.linkId, link.rssi);
    }, 600 + Math.random() * 800);
  }

  private jitterRssi() {
    this.peers.forEach(p => {
      const drift = (Math.random() - 0.5) * 4;
      p.link.rssi = Math.max(-95, Math.min(-30, p.link.rssi + drift));
      p.link.lastSeenMs = Date.now();
      this.events?.onRssi(p.link.linkId, p.link.rssi);
    });
  }

  private churn() {
    if (this.peers.size > 0 && Math.random() < 0.5) {
      const ids = [...this.peers.keys()];
      const drop = ids[Math.floor(Math.random() * ids.length)];
      const peer = this.peers.get(drop)!;
      this.peers.delete(drop);
      this.events?.onLinkDown(peer.link);
    }
    if (this.peers.size < this.cfg.peerCount) {
      this.spawnPeer();
    }
  }
}
