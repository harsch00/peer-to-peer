/**
 * Bootstraps the global MeshNode singleton.
 *
 * On phone targets we register BLE + Wi-Fi Direct + Nostr. On Windows we use
 * Wi-Fi Direct + Nostr (BLE peripheral mode is partially supported on Win11
 * but not in this MVP). The simulator is now opt-in only so real builds never
 * show fake peers.
 */
import {PermissionsAndroid, Platform} from 'react-native';
import {MeshNode} from './meshNode';
import {TransportManager} from '../transport/transportManager';
import {BleTransport} from '../transport/ble';
import {WifiDirectTransport} from '../transport/wifiDirect';
import {NostrTransport} from '../transport/nostr';
import {usePeersStore} from '../../state/peersStore';
import {useMessagesStore} from '../../state/messagesStore';
import {useDiagnosticsStore} from '../../state/diagnosticsStore';
import {useProfileStore} from '../../state/profileStore';

let node: MeshNode | null = null;
const ENABLE_SIMULATOR = false;
const ENABLE_DEMO_TRAFFIC = false;

export async function bootstrapMesh(): Promise<MeshNode> {
  if (node) return node;

  const profile = await useProfileStore.getState().hydrate();
  await useMessagesStore.getState().hydrate();
  await requestTransportPermissions();
  const tm = new TransportManager();
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    tm.add(new BleTransport());
    tm.add(new WifiDirectTransport());
  }
  if (Platform.OS === 'windows') {
    tm.add(new WifiDirectTransport());
  }
  tm.add(new NostrTransport());

  const n = new MeshNode(tm, profile.identity);
  node = n;

  // wire UI stores
  n.on('links', links => usePeersStore.getState().setPeers(links));
  n.on('session', () => usePeersStore.getState().setPeers(tm.allLinks()));
  n.on('message', msg => useMessagesStore.getState().push(msg));
  n.on('diag', e => useDiagnosticsStore.getState().push(e));

  // expose identity to the UI
  usePeersStore.getState().setIdentity(n.identity);
  const cryptoProvider = (globalThis as unknown as {__cryptoPolyfillProvider?: string})
    .__cryptoPolyfillProvider;
  useDiagnosticsStore.getState().push({
    ts: Date.now(),
    level: 'info',
    event: 'TRANSPORTS_CONFIGURED',
    fields: {
      platform: Platform.OS,
      transports: tm.list().map(t => t.id),
      simulator: ENABLE_SIMULATOR,
      cryptoProvider: cryptoProvider ?? 'unknown',
    },
  });

  await n.start();

  if (__DEV__ && ENABLE_DEMO_TRAFFIC) {
    setTimeout(() => seedDemoTraffic(n), 1500);
  }
  return n;
}

async function seedDemoTraffic(n: MeshNode) {
  const greetings = [
    'gm mesh — anyone within 50m?',
    'just bridged a packet over Nostr',
    'ttl=7 still going strong',
    'who wants to test path-tracing?',
  ];
  for (const g of greetings) {
    try {
      await n.sendBroadcast(g);
    } catch {
      // ignore
    }
    await new Promise<void>(res => setTimeout(res, 1800));
  }
}

export function getMesh(): MeshNode {
  if (!node) throw new Error('mesh not bootstrapped');
  return node;
}

export function maybeMesh(): MeshNode | null {
  return node;
}

async function requestTransportPermissions() {
  if (Platform.OS !== 'android') return;
  const androidPermissions = PermissionsAndroid.PERMISSIONS as Record<string, string>;
  const permissions = [
    androidPermissions.ACCESS_FINE_LOCATION,
    androidPermissions.BLUETOOTH_SCAN,
    androidPermissions.BLUETOOTH_CONNECT,
    androidPermissions.BLUETOOTH_ADVERTISE,
    androidPermissions.NEARBY_WIFI_DEVICES,
  ].filter(Boolean) as string[];

  try {
    await PermissionsAndroid.requestMultiple(permissions as any);
  } catch (e) {
    useDiagnosticsStore.getState().push({
      ts: Date.now(),
      level: 'warn',
      event: 'TRANSPORT_PERMISSION_REQUEST_FAILED',
      fields: {error: String(e)},
    });
  }
}
