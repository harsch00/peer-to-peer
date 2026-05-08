/**
 * Wi-Fi Direct (P2P) transport.
 *
 * Android exposes Wi-Fi P2P via `WifiP2pManager`. On Windows we currently
 * piggy-back on Wi-Fi Aware / mDNS-SD discovery exposed through native
 * bridges. For phase-1 we ship a thin adapter that gracefully degrades when
 * no native module is registered, exactly like the BLE transport.
 */
import type {MeshTransport, PeerLink, TransportEvents} from './types';
import {NativeEventEmitter, NativeModules} from 'react-native';
import {useDiagnosticsStore} from '../../state/diagnosticsStore';

const SERVICE_NAME = 'p2pmesh._tcp';
const PORT = 8444;

export class WifiDirectTransport implements MeshTransport {
  readonly id = 'wifi-direct' as const;
  readonly displayName = 'Wi-Fi Direct';
  private events?: TransportEvents;
  private linkMap = new Map<string, PeerLink>();
  private subs: Array<{remove: () => void}> = [];
  private nativeModule: any | null = null;

  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    this.nativeModule =
      (NativeModules as any).P2PWifiDirect ?? (NativeModules as any).P3PWifiDirect ?? null;
    if (!this.nativeModule) {
      diag('warn', 'WIFI_DIRECT_NATIVE_MODULE_MISSING');
      return;
    }

    const emitter = new NativeEventEmitter(this.nativeModule);
    this.subs.push(
      emitter.addListener('peerFound', (info: {address: string; rssi?: number}) => {
        const linkId = `wfd:${info.address}`;
        if (!this.linkMap.has(linkId)) {
          const link: PeerLink = {
            linkId,
            transport: 'wifi-direct',
            rssi: info.rssi ?? -50,
            secured: false,
            lastSeenMs: Date.now(),
            reliability: 1,
          };
          this.linkMap.set(linkId, link);
          this.events?.onLinkUp(link);
        }
      }),
      emitter.addListener('peerLost', (info: {address: string}) => {
        const linkId = `wfd:${info.address}`;
        const link = this.linkMap.get(linkId);
        if (link) {
          this.events?.onLinkDown(link);
          this.linkMap.delete(linkId);
        }
      }),
      emitter.addListener('packet', (info: {address: string; data: string}) => {
        const linkId = `wfd:${info.address}`;
        this.events?.onPacket(linkId, base64ToBytes(info.data));
      }),
      emitter.addListener('status', (info: {event?: string}) => {
        diag('info', info.event ?? 'WIFI_DIRECT_STATUS');
      }),
      emitter.addListener('error', (info: {event?: string; message?: string}) => {
        diag('error', info.event ?? 'WIFI_DIRECT_ERROR', {message: info.message});
      }),
    );

    try {
      await this.nativeModule.startDiscovery({serviceName: SERVICE_NAME, port: PORT});
    } catch (e) {
      diag('error', 'WIFI_DIRECT_START_FAILED', {error: String(e)});
    }
  }

  async stop(): Promise<void> {
    this.subs.forEach(s => s.remove());
    this.subs = [];
    try {
      await this.nativeModule?.stopDiscovery?.();
    } catch {
      // ignore
    }
    this.linkMap.clear();
  }

  async send(linkId: string, bytes: Uint8Array): Promise<void> {
    if (!this.nativeModule) return;
    const address = linkId.replace(/^wfd:/, '');
    await this.nativeModule.send({address, data: bytesToBase64(bytes)});
  }

  async broadcast(bytes: Uint8Array, exceptLinkId?: string): Promise<void> {
    await Promise.allSettled(
      [...this.linkMap.keys()]
        .filter(id => id !== exceptLinkId)
        .map(id => this.send(id, bytes)),
    );
  }

  links(): PeerLink[] {
    return [...this.linkMap.values()];
  }
}

function diag(level: 'info' | 'warn' | 'error', event: string, fields?: Record<string, unknown>) {
  useDiagnosticsStore.getState().push({ts: Date.now(), level, event, fields});
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
