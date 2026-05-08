/**
 * Bootstraps the global MeshNode singleton.
 *
 * On phone targets we register BLE + Wi‑Fi Direct, and optionally Nostr if enabled
 * in Settings. On Windows we use BLE + Wi‑Fi Direct with the same opt‑in Nostr gateway.
 */
import {PermissionsAndroid, Platform} from 'react-native';
import {MeshNode} from './meshNode';
import {TransportManager} from '../transport/transportManager';
import {BleTransport} from '../transport/ble';
import {WifiDirectTransport} from '../transport/wifiDirect';
import {NostrTransport} from '../transport/nostr';
import {getAllowNostrGateway} from '../../state/meshPrefs';
import {usePeersStore} from '../../state/peersStore';
import {useMessagesStore} from '../../state/messagesStore';
import {useDiagnosticsStore} from '../../state/diagnosticsStore';
import {useProfileStore} from '../../state/profileStore';
import {usePeerDirectoryStore} from '../../state/peerDirectoryStore';

import {setMeshNode, maybeMesh} from './meshSingleton';
const ENABLE_SIMULATOR = false;
const ENABLE_DEMO_TRAFFIC = false;

export async function bootstrapMesh(): Promise<MeshNode> {
  const existing = maybeMesh();
  if (existing) {
    return existing;
  }

  const profile = await useProfileStore.getState().hydrate();
  await usePeerDirectoryStore.getState().hydrate();
  await useMessagesStore.getState().hydrate();
  await requestTransportPermissions();
  const allowNostrGateway = await getAllowNostrGateway();
  const tm = new TransportManager();
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    tm.add(new BleTransport());
    tm.add(new WifiDirectTransport());
  }
  if (Platform.OS === 'windows') {
    tm.add(new BleTransport());
    tm.add(new WifiDirectTransport());
  }
  if (allowNostrGateway) {
    tm.add(new NostrTransport());
  }

  const n = new MeshNode(tm, profile.identity);
  setMeshNode(n);

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
      nostrGateway: allowNostrGateway,
      simulator: ENABLE_SIMULATOR,
      cryptoProvider: cryptoProvider ?? 'unknown',
    },
  });

  await n.start();

  const prof = useProfileStore.getState().profile;
  if (prof) {
    void n.broadcastPeerProfile(prof.displayName, prof.avatarStyle);
  }
  // Re-announce profile whenever a secure session is established so new peers
  // reliably learn custom display name + avatar even if they missed startup gossip.
  n.on('session', () => {
    const p = useProfileStore.getState().profile;
    if (p) {
      void n.broadcastPeerProfile(p.displayName, p.avatarStyle);
    }
  });

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

export {getMesh, maybeMesh} from './meshSingleton';

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
