/**
 * Bluetooth Low Energy transport.
 *
 * Android / iOS: react-native-ble-plx (central). Android also runs `P2PBleMeshPeripheral`
 * (GATT server + advertiser) so filtered scans find peers.
 *
 * Windows: native `P2PMeshBle` (WinRT central — advertisement watcher + GATT). Peers must
 * advertise the mesh service UUID (e.g. Android with the mesh advertiser).
 */
import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
  TurboModuleRegistry,
} from 'react-native';
import type {MeshTransport, PeerLink, TransportEvents} from './types';

type P2PMeshBleNative = {
  startScan: (serviceUuid: string) => Promise<boolean>;
  stopScan: () => Promise<boolean>;
  connectDevice: (macColonUpper: string) => Promise<boolean>;
  disconnectDevice: (macColonUpper: string) => Promise<boolean>;
  disconnectAll: () => Promise<boolean>;
  writeRx: (
    macColonUpper: string,
    serviceUuid: string,
    rxCharUuid: string,
    payloadBase64: string,
  ) => Promise<boolean>;
  readRssi: (macColonUpper: string) => Promise<number>;
  addListener: (event: string) => void;
  removeListeners: (count: number) => void;
};

export const BLE_SERVICE_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const BLE_TX_CHAR_UUID = 'f47ac10c-58cc-4372-a567-0e02b2c3d479';
export const BLE_RX_CHAR_UUID = 'f47ac10d-58cc-4372-a567-0e02b2c3d479';

const MTU_BYTES = 244;

type P2PPeripheral = {
  start: (service: string, tx: string, rx: string) => Promise<boolean>;
  stop: () => Promise<boolean>;
  notifyCentral: (address: string, payloadB64: string) => Promise<boolean>;
  getDiagnostics?: () => Promise<Record<string, unknown>>;
  addListener: (event: string) => void;
  removeListeners: (count: number) => void;
};

const NativeMod = NativeModules as Record<string, unknown>;

function getWindowsMeshBleModule(): P2PMeshBleNative | null {
  const legacy =
    (NativeMod.P2PMeshBle as P2PMeshBleNative | undefined) ??
    (NativeMod.P3PMeshBle as P2PMeshBleNative | undefined);
  if (legacy) {
    return legacy;
  }
  return TurboModuleRegistry.get('P2PMeshBle') as P2PMeshBleNative | null;
}

function getAndroidBleMeshPeripheral(): P2PPeripheral | undefined {
  return (NativeMod.P2PBleMeshPeripheral ?? NativeMod.P3PBleMeshPeripheral) as
    | P2PPeripheral
    | undefined;
}

function nativeBleRelatedModuleKeys(): string {
  return Object.keys(NativeMod)
    .filter(k => /ble|mesh|wifi|random|file|picker|plx|p2p|p3p/i.test(k))
    .sort()
    .join(', ');
}

function normServiceUuid(u: string): string {
  return String(u).replace(/-/g, '').toLowerCase();
}

function bleLinkIdFromAddress(address: string): string {
  return `ble:${address.trim().toUpperCase()}`;
}

export class BleTransport implements MeshTransport {
  readonly id = 'ble' as const;
  readonly displayName = 'Bluetooth LE';
  private events?: TransportEvents;
  private linkMap = new Map<string, PeerLink>();
  private manager: any | null = null;
  private managerSubs = new Map<string, {remove: () => void}>();
  /** Outbound GATT client links (we are central; writes go to peer RX). */
  private outboundLinks = new Set<string>();
  /** Peer MAC (uppercase) for devices that connected to our GATT server — we notify them on TX. */
  private inboundAddresses = new Set<string>();
  private connecting = new Set<string>();
  private linkAnnounced = new Set<string>();
  private peripheralSubs: Array<{remove: () => void}> = [];
  /** WinRT BLE (react-native-windows); see `windows/p2pmesh/P2PMeshBleModule.cpp`. */
  private winBle: P2PMeshBleNative | null = null;
  private winBleEmitterSubs: Array<{remove: () => void}> = [];

  async start(events: TransportEvents): Promise<void> {
    this.events = events;
    if (Platform.OS === 'android') {
      await this.startAndroidPeripheral();
    }
    const win = getWindowsMeshBleModule();
    if (Platform.OS === 'windows' && win) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {DeviceEventEmitter} = require('react-native');
      this.winBle = win;
      this.winBleEmitterSubs.push(
        DeviceEventEmitter.addListener(
          'meshBleScan',
          (p: {id?: string; rssi?: number; serviceUUIDs?: string[]}) => this.onWinBleScanPayload(p),
        ),
        DeviceEventEmitter.addListener('meshBleDisconnected', (p: {id?: string}) =>
          this.onWinBleDisconnected(p),
        ),
      );
      try {
        await this.winBle.startScan(BLE_SERVICE_UUID);
      } catch {
        this.winBle = null;
      }
      return;
    }
    if (NativeModules.BlePlx == null) {
      this.manager = null;
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {BleManager} = require('react-native-ble-plx');
      this.manager = new BleManager();
      await this.attachFilteredScan();
    } catch {
      this.manager = null;
      this.linkMap.clear();
    }
  }

  private async attachFilteredScan(): Promise<void> {
    if (!this.manager || !this.events) {
      return;
    }
    await this.manager.startDeviceScan(
      [BLE_SERVICE_UUID],
      {allowDuplicates: false},
      (error: unknown, device: any) => {
        if (error || !device) {
          return;
        }
        const addr = String(device.id || '').toUpperCase();
        const linkId = addr ? bleLinkIdFromAddress(addr) : `ble:${device.id}`;
        const link: PeerLink = {
          linkId,
          transport: 'ble',
          rssi: device.rssi ?? -90,
          secured: false,
          lastSeenMs: Date.now(),
          reliability: 1,
        };
        if (!this.linkMap.has(linkId)) {
          this.linkMap.set(linkId, link);
        } else {
          const existing = this.linkMap.get(linkId)!;
          existing.rssi = device.rssi ?? existing.rssi;
          existing.lastSeenMs = Date.now();
          this.events?.onRssi(linkId, existing.rssi);
        }
        if (!this.outboundLinks.has(linkId) && !this.connecting.has(linkId)) {
          this.connecting.add(linkId);
          this.connect(device, linkId).finally(() => this.connecting.delete(linkId));
        }
      },
    );
  }

  private onWinBleScanPayload(payload: {id?: string; rssi?: number; serviceUUIDs?: string[]}) {
    if (!payload?.id || !this.events) {
      return;
    }
    const addr = String(payload.id).toUpperCase();
    const linkId = bleLinkIdFromAddress(addr);
    const rssi = typeof payload.rssi === 'number' ? payload.rssi : -80;
    const faux: {[k: string]: unknown} = {
      _meshWinBle: true,
      id: addr,
      rssi,
      serviceUUIDs: payload.serviceUUIDs ?? [BLE_SERVICE_UUID],
    };
    const link: PeerLink = {
      linkId,
      transport: 'ble',
      rssi,
      secured: false,
      lastSeenMs: Date.now(),
      reliability: 1,
    };
    if (!this.linkMap.has(linkId)) {
      this.linkMap.set(linkId, link);
    } else {
      const existing = this.linkMap.get(linkId)!;
      existing.rssi = rssi;
      existing.lastSeenMs = Date.now();
      this.events.onRssi(linkId, existing.rssi);
    }
    if (!this.outboundLinks.has(linkId) && !this.connecting.has(linkId)) {
      this.connecting.add(linkId);
      this.connect(faux, linkId).finally(() => this.connecting.delete(linkId));
    }
  }

  private onWinBleDisconnected(payload: {id?: string}) {
    if (!payload?.id) {
      return;
    }
    const addr = String(payload.id).toUpperCase();
    const linkId = bleLinkIdFromAddress(addr);
    const sub = this.managerSubs.get(linkId);
    try {
      sub?.remove();
    } catch {
      // ignore
    }
    this.managerSubs.delete(linkId);
    this.outboundLinks.delete(linkId);
    const link = this.linkMap.get(linkId);
    if (link && this.linkAnnounced.has(linkId)) {
      this.linkAnnounced.delete(linkId);
      this.events?.onLinkDown(link);
    } else {
      this.linkAnnounced.delete(linkId);
    }
    this.linkMap.delete(linkId);
  }

  private async connectWindowsMesh(device: {[k: string]: any}, linkId: string) {
    try {
      if (!this.winBle) {
        return;
      }
      await this.winBle.connectDevice(String(device.id));
      const link = this.linkMap.get(linkId);
      if (link && !this.linkAnnounced.has(linkId)) {
        this.linkAnnounced.add(linkId);
        this.events?.onLinkUp(link);
      }
      this.outboundLinks.add(linkId);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {DeviceEventEmitter} = require('react-native');
      const mac = String(device.id).toUpperCase();
      const sub = DeviceEventEmitter.addListener('meshBleNotify', (e: {id?: string; value?: string}) => {
        if (!e?.value) {
          return;
        }
        if (String(e.id || '').toUpperCase() !== mac) {
          return;
        }
        const bytes = base64ToBytes(e.value);
        this.events?.onPacket(linkId, bytes);
      });
      this.managerSubs.set(linkId, sub);
      setInterval(async () => {
        try {
          const r = await this.winBle!.readRssi(mac);
          const l = this.linkMap.get(linkId);
          if (l) {
            l.rssi = r;
            this.events?.onRssi(linkId, l.rssi);
          }
        } catch {
          /* connection likely ended */
        }
      }, 2500);
    } catch {
      const link = this.linkMap.get(linkId);
      const idNoPrefix = linkId.replace(/^ble:/i, '');
      const keepInbound = this.inboundAddresses.has(idNoPrefix);
      if (!keepInbound) {
        if (link && this.linkAnnounced.has(linkId)) {
          this.linkAnnounced.delete(linkId);
          this.events?.onLinkDown(link);
        } else {
          this.linkAnnounced.delete(linkId);
        }
        this.linkMap.delete(linkId);
      }
    }
  }

  /**
   * One-shot: permissions, adapter state, native advertiser snapshot (Android), then an
   * unfiltered scan burst. Restores the normal mesh-UUID scan when the transport is active.
   */
  async runDiscoveryDiagnostics(): Promise<string[]> {
    const lines: string[] = [];
    const iso = () => new Date().toISOString();
    lines.push(`[${iso()}] Force peer discovery — BLE diagnostics`);
    lines.push(`Platform: ${Platform.OS}`);

    if (Platform.OS === 'ios') {
      lines.push(
        'This build does not run a BLE peripheral on iOS. You only see peers that advertise the mesh service (e.g. Android with the mesh advertiser).',
      );
    }

    if (Platform.OS === 'android') {
      const P = PermissionsAndroid.PERMISSIONS as Record<string, string | undefined>;
      const pairs: [string, string | undefined][] = [
        ['BLUETOOTH_SCAN', P.BLUETOOTH_SCAN],
        ['BLUETOOTH_CONNECT', P.BLUETOOTH_CONNECT],
        ['BLUETOOTH_ADVERTISE', P.BLUETOOTH_ADVERTISE],
        ['ACCESS_FINE_LOCATION', P.ACCESS_FINE_LOCATION],
      ];
      for (const [label, perm] of pairs) {
        if (!perm) {
          continue;
        }
        try {
          const ok = await PermissionsAndroid.check(perm as never);
          lines.push(
            `Permission ${label}: ${ok ? 'granted' : 'NOT granted — BLE scan or advertise may be blocked'}`,
          );
        } catch {
          lines.push(`Permission ${label}: could not check`);
        }
      }

      const mod = getAndroidBleMeshPeripheral();
      if (mod?.getDiagnostics) {
        try {
          const d = await mod.getDiagnostics();
          lines.push('Native mesh peripheral (P2PBleMeshPeripheral):');
          lines.push(
            `  Bluetooth adapter present=${String(d.adapterPresent)} enabled=${String(d.adapterEnabled)}`,
          );
          lines.push(
            `  advertisingActive=${String(d.advertisingActive)} gattServerOpen=${String(d.gattServerOpen)}`,
          );
          lines.push(
            `  LE advertiser non-null=${String(d.advertiserNonNull)} centrals connected=${String(d.connectedCentrals)}`,
          );
          if (d.lastAdvertiseFailureCode != null) {
            const reason =
              d.lastAdvertiseFailureReason != null ? String(d.lastAdvertiseFailureReason) : '';
            lines.push(
              `  Last advertise failure: ${reason || 'unknown'} (code ${String(d.lastAdvertiseFailureCode)})`,
            );
            if (reason === 'DATA_TOO_LARGE' || Number(d.lastAdvertiseFailureCode) === 1) {
              lines.push(
                '    → AD payload exceeded 31-byte legacy limit (e.g. local device name + full UUID). App fix: omit local name from the advertisement.',
              );
            }
          }
          if (d.permBluetoothScan === false || d.permBluetoothAdvertise === false) {
            lines.push(
              '  Native check: missing BLUETOOTH_SCAN / BLUETOOTH_ADVERTISE / CONNECT — grant in system settings.',
            );
          }
          if (d.adapterEnabled === false) {
            lines.push('  FAIL: Bluetooth is off or adapter disabled — turn Bluetooth on.');
          }
          if (d.advertisingActive === false && d.gattServerOpen === true) {
            lines.push(
              '  WARN: GATT server open but advertising not active — peers may not see your service in scan filters.',
            );
          }
        } catch (e) {
          lines.push(`Native getDiagnostics failed: ${String(e)}`);
        }
      } else {
        lines.push(
          'P2PBleMeshPeripheral.getDiagnostics not found — install a fresh Android build; without the peripheral, filtered scans see no peers.',
        );
      }
    } else if (Platform.OS === 'windows') {
      lines.push(
        'Windows: BLE uses native P2PMeshBle (WinRT central) when linked, or react-native-ble-plx otherwise.',
      );
      lines.push(`NativeModules keys (BLE-related): ${nativeBleRelatedModuleKeys() || '(none)'}.`);
      const winBle = getWindowsMeshBleModule();
      if (winBle) {
        lines.push('P2PMeshBle is present — scan/connect use Bluetooth LE advertisement watcher + GATT.');
        lines.push('Ensure Bluetooth is on and a peer (e.g. Android mesh build) advertises the mesh UUID.');
        return lines;
      }
      if (NativeModules.BlePlx == null) {
        lines.push(
          'FAIL: Neither P2PMeshBle nor BlePlx is available. Rebuild the Windows app (p2pmesh project) so P2PMeshBleModule.cpp is compiled and linked.',
        );
        return lines;
      }
    }

    const meshNorm = normServiceUuid(BLE_SERVICE_UUID);
    let mgr = this.manager;
    if (!mgr) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const {BleManager} = require('react-native-ble-plx');
        mgr = new BleManager();
        lines.push('Transport had no BleManager; opened library singleton for this probe only.');
      } catch (e) {
        lines.push(`react-native-ble-plx failed to load: ${String(e)}`);
        return lines;
      }
    }

    let state: string;
    try {
      state = await mgr.state();
      lines.push(`BleManager.state: ${state}`);
    } catch (e) {
      lines.push(`BleManager.state() failed: ${String(e)}`);
      return lines;
    }

    if (state !== 'PoweredOn') {
      lines.push(
        'Scan will not run until state is PoweredOn. Enable Bluetooth in OS settings and try again.',
      );
      return lines;
    }

    const PROBE_MS = 6500;
    const seenDevices = new Set<string>();
    const meshAdvertisers = new Set<string>();
    let firstScanError: string | null = null;

    try {
      await mgr.stopDeviceScan();
    } catch {
      // ignore
    }

    await new Promise<void>(resolve => {
      let finished = false;
      const finish = () => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        void mgr.stopDeviceScan().finally(finish);
      }, PROBE_MS);

      mgr
        .startDeviceScan(
          null,
          {allowDuplicates: true},
          (error: unknown, device: any) => {
            if (error) {
              if (!firstScanError) {
                const err = error as {message?: string; reason?: string; errorCode?: number | string};
                firstScanError = [
                  err.message ?? err.reason ?? String(error),
                  err.errorCode != null ? ` (code: ${String(err.errorCode)})` : '',
                ]
                  .join('')
                  .trim();
              }
              return;
            }
            if (!device?.id) {
              return;
            }
            seenDevices.add(device.id);
            const uuids: string[] = device.serviceUUIDs ?? [];
            for (const u of uuids) {
              if (normServiceUuid(u) === meshNorm) {
                meshAdvertisers.add(device.id);
              }
            }
          },
        )
        .catch((e: unknown) => {
          firstScanError = String(e);
          finish();
        });
    });

    if (firstScanError) {
      lines.push(`Scan error during unfiltered probe: ${firstScanError}`);
      lines.push(
        'Typical causes: missing BLUETOOTH_SCAN (Android 12+), location permission on older Android, Bluetooth off, or OS battery restrictions.',
      );
    }

    lines.push(
      `Unfiltered scan (~${PROBE_MS / 1000}s): ${seenDevices.size} unique BLE device id(s) seen (any service).`,
    );
    lines.push(
      `Devices advertising mesh service ${BLE_SERVICE_UUID}: ${meshAdvertisers.size}. (Filtered discovery only counts these.)`,
    );

    if (!firstScanError && seenDevices.size === 0) {
      lines.push(
        'No advertisements received — radio stack returned nothing. Toggle Bluetooth, confirm permissions, move closer to any BLE device, and disable battery saver if needed.',
      );
    }

    if (seenDevices.size > 0 && meshAdvertisers.size === 0) {
      lines.push(
        'BLE scan works, but nobody nearby is advertising the mesh UUID (from scan callbacks).',
        'Phones usually do not report their *own* advertisements — test with two devices side‑by‑side, or Windows + Android.',
        'Android builds must include P2PBleMeshPeripheral (scan‑response UUID is advertised for better discovery).',
        'Other peers need the same mesh service UUID, or use Wi‑Fi / Nostr.',
      );
    }

    if (meshAdvertisers.size > 0) {
      lines.push(
        `${meshAdvertisers.size} mesh advertiser(s) visible — if links still fail, the issue is likely GATT/connect or handshake, not discovery.`,
      );
    }

    try {
      await mgr.stopDeviceScan();
    } catch {
      // ignore
    }

    if (this.manager && this.events) {
      try {
        await this.attachFilteredScan();
      } catch (e) {
        lines.push(`WARNING: could not restore mesh scan: ${String(e)}`);
      }
    }

    return lines;
  }

  private async startAndroidPeripheral() {
    const mod = getAndroidBleMeshPeripheral();
    if (!mod?.start) return;
    try {
      await mod.start(BLE_SERVICE_UUID, BLE_TX_CHAR_UUID, BLE_RX_CHAR_UUID);
    } catch {
      return;
    }
    const emitter = new NativeEventEmitter(mod as any);
    this.peripheralSubs.push(
      emitter.addListener(
        'BleMeshPeripheralRx',
        (e: {linkId?: string; payloadB64?: string}) => {
          if (!e?.payloadB64 || !e.linkId) return;
          const bytes = base64ToBytes(e.payloadB64);
          this.events?.onPacket(e.linkId, bytes);
        },
      ),
    );
    this.peripheralSubs.push(
      emitter.addListener('BleMeshCentralConnected', (e: {linkId?: string; address?: string}) => {
        if (!e?.linkId || !e.address) return;
        this.inboundAddresses.add(e.address.toUpperCase());
        if (this.linkMap.has(e.linkId)) {
          return;
        }
        const link: PeerLink = {
          linkId: e.linkId,
          transport: 'ble',
          rssi: -55,
          secured: false,
          lastSeenMs: Date.now(),
          reliability: 1,
        };
        this.linkMap.set(e.linkId, link);
        if (!this.linkAnnounced.has(e.linkId)) {
          this.linkAnnounced.add(e.linkId);
          this.events?.onLinkUp(link);
        }
      }),
    );
    this.peripheralSubs.push(
      emitter.addListener('BleMeshCentralDisconnected', (e: {linkId?: string; address?: string}) => {
        if (e?.address) this.inboundAddresses.delete(e.address.toUpperCase());
        if (!e?.linkId) return;
        const link = this.linkMap.get(e.linkId);
        if (link && !this.outboundLinks.has(e.linkId)) {
          this.linkAnnounced.delete(e.linkId);
          this.events?.onLinkDown(link);
          this.linkMap.delete(e.linkId);
        }
      }),
    );
  }

  private async connect(device: any, linkId: string) {
    if (device?._meshWinBle === true) {
      await this.connectWindowsMesh(device, linkId);
      return;
    }
    try {
      const connected = await device.connect({requestMTU: MTU_BYTES});
      await connected.discoverAllServicesAndCharacteristics();
      const link = this.linkMap.get(linkId);
      if (link && !this.linkAnnounced.has(linkId)) {
        this.linkAnnounced.add(linkId);
        this.events?.onLinkUp(link);
      }
      this.outboundLinks.add(linkId);

      const sub = connected.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_TX_CHAR_UUID,
        (err: unknown, ch: any) => {
          if (err || !ch?.value) return;
          const bytes = base64ToBytes(ch.value);
          this.events?.onPacket(linkId, bytes);
        },
      );
      this.managerSubs.set(linkId, sub);

      setInterval(async () => {
        try {
          const rssi = await connected.readRSSI();
          const l = this.linkMap.get(linkId);
          if (l) {
            l.rssi = rssi.rssi ?? l.rssi;
            this.events?.onRssi(linkId, l.rssi);
          }
        } catch {
          /* connection likely ended */
        }
      }, 2500);
    } catch {
      const idNoPrefix = linkId.replace(/^ble:/i, '');
      const link = this.linkMap.get(linkId);
      const keepInbound = this.inboundAddresses.has(idNoPrefix);
      if (!keepInbound) {
        if (link && this.linkAnnounced.has(linkId)) {
          this.linkAnnounced.delete(linkId);
          this.events?.onLinkDown(link);
        } else {
          this.linkAnnounced.delete(linkId);
        }
        this.linkMap.delete(linkId);
      }
    }
  }

  async stop(): Promise<void> {
    for (const s of this.peripheralSubs) {
      try {
        s.remove();
      } catch {
        // ignore
      }
    }
    this.peripheralSubs = [];
    this.inboundAddresses.clear();
    this.outboundLinks.clear();
    this.connecting.clear();
    this.linkAnnounced.clear();
    for (const s of this.winBleEmitterSubs) {
      try {
        s.remove();
      } catch {
        // ignore
      }
    }
    this.winBleEmitterSubs = [];
    if (this.winBle) {
      try {
        await this.winBle.disconnectAll();
      } catch {
        // ignore
      }
      try {
        await this.winBle.stopScan();
      } catch {
        // ignore
      }
      this.winBle = null;
    }
    for (const s of this.managerSubs.values()) {
      try {
        s.remove();
      } catch {
        // ignore
      }
    }
    this.managerSubs.clear();
    if (Platform.OS === 'android') {
      const mod = getAndroidBleMeshPeripheral();
      try {
        await mod?.stop?.();
      } catch {
        // ignore
      }
    }
    try {
      this.manager?.stopDeviceScan?.();
      this.manager?.destroy?.();
    } catch {
      // ignore
    }
    this.manager = null;
    this.linkMap.clear();
  }

  async send(linkId: string, bytes: Uint8Array): Promise<void> {
    const idNoPrefix = linkId.replace(/^ble:/i, '').toUpperCase();
    const mod = getAndroidBleMeshPeripheral();

    const useNotify =
      Platform.OS === 'android' &&
      mod?.notifyCentral &&
      this.inboundAddresses.has(idNoPrefix) &&
      !this.outboundLinks.has(linkId);

    if (useNotify) {
      for (let off = 0; off < bytes.length; off += MTU_BYTES) {
        const slice = bytes.slice(off, off + MTU_BYTES);
        await mod.notifyCentral(idNoPrefix, bytesToBase64(slice));
      }
      return;
    }

    if (Platform.OS === 'windows' && this.winBle) {
      for (let off = 0; off < bytes.length; off += MTU_BYTES) {
        const slice = bytes.slice(off, off + MTU_BYTES);
        await this.winBle.writeRx(idNoPrefix, BLE_SERVICE_UUID, BLE_RX_CHAR_UUID, bytesToBase64(slice));
      }
      return;
    }

    if (!this.manager) return;
    for (let off = 0; off < bytes.length; off += MTU_BYTES) {
      const slice = bytes.slice(off, off + MTU_BYTES);
      await this.manager.writeCharacteristicWithoutResponseForDevice(
        idNoPrefix,
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

function bytesToBase64(b: Uint8Array): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (globalThis as any).btoa === 'function') {
    let bin = '';
    for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return (globalThis as any).btoa(bin);
  }
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
