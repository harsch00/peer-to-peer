/**
 * Bluetooth Low Energy transport.
 *
 * Real implementation requires `react-native-ble-plx` and platform-specific
 * permissions/manifests. We keep the surface area small and resilient: if the
 * native module is unavailable (e.g. running in a simulator without BT), the
 * transport silently no-ops instead of crashing the app.
 *
 * Service & characteristic UUIDs follow the Bitchat reference:
 *   • Service:    F47AC10B-58CC-4372-A567-0E02B2C3D479
 *   • TX char:    F47AC10C-58CC-4372-A567-0E02B2C3D479  (notify)
 *   • RX char:    F47AC10D-58CC-4372-A567-0E02B2C3D479  (write w/o response)
 */
import type {MeshTransport, PeerLink, TransportEvents} from './types';

export const BLE_SERVICE_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const BLE_TX_CHAR_UUID = 'f47ac10c-58cc-4372-a567-0e02b2c3d479';
export const BLE_RX_CHAR_UUID = 'f47ac10d-58cc-4372-a567-0e02b2c3d479';

const MTU_BYTES = 244; // typical BLE 5 negotiated MTU

interface PendingWrite {
  data: Uint8Array;
  resolve: () => void;
  reject: (e: unknown) => void;
}

/**
 * The class only references `react-native-ble-plx` lazily inside `start()`
 * so code paths that don't need BLE (e.g. unit tests, Windows desktop with no
 * BT adapter) never pay the import cost.
 */
export class BleTransport implements MeshTransport {
  readonly id = 'ble' as const;
  readonly displayName = 'Bluetooth LE';
  private events?: TransportEvents;
  private linkMap = new Map<string, PeerLink>();
  private writeQueues = new Map<string, PendingWrite[]>();
  private manager: any | null = null;
  private scanSub: any | null = null;

  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {BleManager} = require('react-native-ble-plx');
      this.manager = new BleManager();
      this.manager.startDeviceScan(
        [BLE_SERVICE_UUID],
        {allowDuplicates: false},
        (error: unknown, device: any) => {
          if (error || !device) return;
          const link: PeerLink = {
            linkId: `ble:${device.id}`,
            transport: 'ble',
            rssi: device.rssi ?? -90,
            secured: false,
            lastSeenMs: Date.now(),
            reliability: 1,
          };
          if (!this.linkMap.has(link.linkId)) {
            this.linkMap.set(link.linkId, link);
            this.connect(device).catch(() => {/* swallow */});
          } else {
            link.rssi = device.rssi ?? link.rssi;
            link.lastSeenMs = Date.now();
            this.events?.onRssi(link.linkId, link.rssi);
          }
        },
      );
    } catch {
      // Native module unavailable. Transport still satisfies the interface.
      this.manager = null;
      this.linkMap.clear();
    }
  }

  private async connect(device: any) {
    try {
      const connected = await device.connect({requestMTU: MTU_BYTES});
      await connected.discoverAllServicesAndCharacteristics();
      const linkId = `ble:${device.id}`;
      const link = this.linkMap.get(linkId)!;
      this.events?.onLinkUp(link);

      this.scanSub = connected.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_TX_CHAR_UUID,
        (err: unknown, ch: any) => {
          if (err || !ch?.value) return;
          const bytes = base64ToBytes(ch.value);
          this.events?.onPacket(linkId, bytes);
        },
      );
      // periodic RSSI poll for the radar
      const rssiTimer = setInterval(async () => {
        try {
          const rssi = await connected.readRSSI();
          link.rssi = rssi.rssi ?? link.rssi;
          this.events?.onRssi(linkId, link.rssi);
        } catch {
          clearInterval(rssiTimer);
        }
      }, 2500);
    } catch (e) {
      const linkId = `ble:${device.id}`;
      const link = this.linkMap.get(linkId);
      if (link) this.events?.onLinkDown(link);
      this.linkMap.delete(linkId);
    }
  }

  async stop(): Promise<void> {
    try {
      this.scanSub?.remove?.();
      this.manager?.stopDeviceScan?.();
      this.manager?.destroy?.();
    } catch {
      // ignore
    }
    this.linkMap.clear();
  }

  async send(linkId: string, bytes: Uint8Array): Promise<void> {
    if (!this.manager) return;
    const id = linkId.replace(/^ble:/, '');
    // Fragment into MTU-sized chunks. Fragmentation reassembly is the
    // responsibility of the application protocol; here we just slice.
    for (let off = 0; off < bytes.length; off += MTU_BYTES) {
      const slice = bytes.slice(off, off + MTU_BYTES);
      await this.manager.writeCharacteristicWithoutResponseForDevice(
        id,
        BLE_SERVICE_UUID,
        BLE_RX_CHAR_UUID,
        bytesToBase64(slice),
      );
    }
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

// --- tiny base64 helpers (avoid Buffer dep on RN) ---

function bytesToBase64(b: Uint8Array): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (globalThis as any).btoa === 'function') {
    let bin = '';
    for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return (globalThis as any).btoa(bin);
  }
  // Fallback: react-native provides Buffer global in some setups.
  const Buffer = (globalThis as any).Buffer;
  return Buffer.from(b).toString('base64');
}

function base64ToBytes(s: string): Uint8Array {
  if (typeof (globalThis as any).atob === 'function') {
    const bin = (globalThis as any).atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const Buffer = (globalThis as any).Buffer;
  return new Uint8Array(Buffer.from(s, 'base64'));
}
