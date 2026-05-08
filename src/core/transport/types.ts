/**
 * Transport-level interfaces.
 *
 * Each transport (BLE, Wi-Fi Direct, Nostr) implements `MeshTransport`.
 * The `TransportManager` multiplexes packets across all available transports
 * so a single mesh node can simultaneously talk over multiple links.
 */

export type TransportId = 'ble' | 'wifi-direct' | 'nostr' | 'sim';

export interface PeerLink {
  /** Stable opaque link ID, scoped to the transport (e.g. BLE address). */
  linkId: string;
  /** 8-byte hex peer ID, set after Noise handshake. */
  peerId?: string;
  transport: TransportId;
  /** RSSI in dBm for radio transports (0 for non-radio). */
  rssi: number;
  /** Whether the Noise session is ready. */
  secured: boolean;
  /** Last activity ms since epoch. */
  lastSeenMs: number;
  /** Packet success / total ratio over a sliding window. */
  reliability: number;
}

export interface TransportEvents {
  onLinkUp: (link: PeerLink) => void;
  onLinkDown: (link: PeerLink) => void;
  onPacket: (linkId: string, bytes: Uint8Array) => void;
  onRssi: (linkId: string, rssi: number) => void;
}

export interface MeshTransport {
  readonly id: TransportId;
  readonly displayName: string;
  start(events: TransportEvents): Promise<void>;
  stop(): Promise<void>;
  send(linkId: string, bytes: Uint8Array): Promise<void>;
  /** Broadcast on every active link maintained by this transport. */
  broadcast(bytes: Uint8Array, exceptLinkId?: string): Promise<void>;
  links(): PeerLink[];
  /**
   * Optional: run a one-shot radio/discovery probe and return human-readable lines for the UI.
   */
  runDiscoveryDiagnostics?: () => Promise<string[]>;
}
