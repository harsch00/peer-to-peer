# P2P Mesh Semester Project - Group Presentation Guide

This guide is designed so 4 team members can present the project with equal contribution.
It covers:

1. Codebase structure and what each area does
2. Complete feature set
3. A 4-speaker split with code snippets and explanation points for each member

---

## 1) Codebase Structure (Start Here in the Presentation)

Use this section in the first 3-5 minutes so the audience understands how the project is organized.

### Root-level files

- `App.tsx`: App root, theme/provider wiring, initial UI boot sequence.
- `index.js`: React Native entry point and runtime bootstrapping.
- `package.json`: scripts, dependencies, build/test commands.
- `README.md`: architecture, setup, and project overview.
- `android/`, `windows/`: platform-native build projects.
- `src/`: all app, protocol, transport, state, and UI logic.

### `src/` high-level architecture

- `src/core/crypto/`: cryptographic primitives and identity generation.
  - `noise.ts`: Noise XX handshake and cipher session logic.
  - `identity.ts`: keypair generation and peer fingerprinting.
- `src/core/protocol/`: mesh packet rules and forwarding behavior.
  - `packet.ts`: packet format encode/decode.
  - `gossip.ts`: dedupe + store-and-forward routing.
  - `bloom.ts`: rotating Bloom filter for duplicate detection.
  - `messageEnvelope.ts`: chat payload format (text/reaction/etc.).
- `src/core/transport/`: connectivity adapters.
  - `ble.ts`, `wifiDirect.ts`, `nostr.ts`, `simulator.ts`.
  - `transportManager.ts`: combines all transports under one interface.
- `src/core/mesh/`:
  - `meshNode.ts`: orchestrates transport + handshake + encryption + gossip.
  - `bootstrap.ts`: singleton startup, permissions, store wiring.
- `src/state/`: Zustand app state.
  - `peersStore.ts`, `messagesStore.ts`, `diagnosticsStore.ts`, `profileStore.ts`.
- `src/navigation/`: platform-aware shells.
  - `RootNavigator.tsx`, `WindowsLayout.tsx`, `AndroidLayout.tsx`.
- `src/ui/`:
  - `screens/`: app routes (Chats, Radar, Diagnostics, Profile, Settings).
  - `components/`: reusable UI widgets (MessageBubble, MeshRadarView, etc.).
  - `theme/`: Fluent/M3 theme tokens and providers.
- `src/hooks/`:
  - `useMesh.ts`: lazy singleton mesh access for UI screens.

### One-line runtime flow

`bootstrap.ts` creates `MeshNode` -> `TransportManager` receives links/packets -> `MeshNode` performs Noise handshake + gossip forwarding -> stores update -> screens render from Zustand state.

---

## 2) Features Provided by the Project

### Networking and Security

- Fully decentralized mesh model (no centralized app server).
- Noise Protocol XX (`Noise_XX_25519_AESGCM_SHA256`) secure session setup.
- Encrypted unicast messaging with per-session send/receive cipher states.
- Gossip-based relay with TTL control and path tracing.
- Rotating Bloom filter deduplication to prevent packet loops/replay spam.
- Store-and-forward for temporary offline peer delivery.

### Multi-Transport Fabric

- BLE transport support.
- Wi-Fi Direct transport support.
- Nostr relay transport for internet-assisted reach.
- Unified transport manager abstraction to treat all links consistently.
- Optional simulator transport for demos/testing when radios are unavailable.

### Messaging + UX Features

- Direct peer chat and broadcast channel.
- Message persistence in local storage.
- Message metadata (hop count, latency, path information).
- Reaction payload support.
- Platform-specific UI shells:
  - Windows: 3-pane Fluent-style layout.
  - Android: M3-inspired bottom navigation flow.
- Radar visualization for nearby peers and link quality.
- Diagnostics dashboard with mesh event counters and logs.
- Profile/identity handling and peer avatar generation.

### Engineering Features

- TypeScript-based architecture.
- Jest tests for protocol/crypto modules (Noise, Bloom, packet codec).
- Decoupled module boundaries: protocol, transport, state, and UI are separated.

---

## 3) Equal 4-Person Presentation Split (Code + Explanation)

Recommended total duration: 24-32 minutes (6-8 min each).

---

## Presenter 1 - System Architecture and Bootstrapping

### Responsibility

Explain how the app starts, how modules are wired, and how data moves from networking layer to UI stores.

### Suggested talking points

- Why we chose layered architecture (`core`, `state`, `ui`, `navigation`).
- How `bootstrapMesh()` initializes permissions, transports, and the mesh singleton.
- How mesh events are bound to Zustand stores for reactive UI updates.
- Why this design is maintainable for a student team (clean boundaries, easy debugging).

### Code snippet A: Mesh bootstrap and transport registration

```ts
import {MeshNode} from './meshNode';
import {TransportManager} from '../transport/transportManager';
import {BleTransport} from '../transport/ble';
import {WifiDirectTransport} from '../transport/wifiDirect';
import {NostrTransport} from '../transport/nostr';

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
```

Source: `src/core/mesh/bootstrap.ts`

### Code snippet B: Wiring mesh events to app state

```ts
n.on('links', links => usePeersStore.getState().setPeers(links));
n.on('session', () => usePeersStore.getState().setPeers(tm.allLinks()));
n.on('message', msg => useMessagesStore.getState().push(msg));
n.on('diag', e => useDiagnosticsStore.getState().push(e));
```

Source: `src/core/mesh/bootstrap.ts`

### Speaker close line

"My part shows that before any chat UI appears, the app already creates a transport fabric, secures identity context, and streams real mesh events into state stores."

---

## Presenter 2 - Cryptography and Protocol Core

### Responsibility

Explain secure communication internals: Noise handshake, packet model, and gossip forwarding rules.

### Suggested talking points

- Why Noise XX is suitable for mutual authentication in decentralized environments.
- How cipher states are created after handshake and used for encrypted messaging.
- How packet dedupe, TTL, and relay prevent loops and optimize reliability.
- How store-and-forward supports temporary disconnection.

### Code snippet A: Noise handshake skeleton

```ts
const m1 = init.writeMessage1();
resp.readMessage1(m1);
const m2 = resp.writeMessage2();
init.readMessage2(m2);
const {message: m3, session: initiator} = init.writeMessage3();
const responder = resp.readMessage3(m3);
```

Source: `src/core/crypto/noise.ts`

### Code snippet B: Gossip ingest + dedupe + relay

```ts
if (this.seen.has(packet.packetId)) {
  this.delegate.diag('PACKET_DUPLICATE', {id: packet.packetId.slice(0, 8)});
  return;
}
this.seen.add(packet.packetId);

const shouldForward =
  packet.ttl > 1 && (packet.recipientId !== me || packet.recipientId === ZERO_PEER);

if (shouldForward) {
  const relayed = relayPacket(packet, me);
  this.delegate.broadcast(encodePacket(relayed), fromLinkId);
}
```

Source: `src/core/protocol/gossip.ts`

### Speaker close line

"This is the reliability-and-security heart of our project: encrypted sessions, controlled forwarding, and duplicate suppression inside a decentralized mesh."

---

## Presenter 3 - Transports and Mesh Orchestration

### Responsibility

Explain how different network mediums are unified and how runtime events are handled by the mesh node.

### Suggested talking points

- Why transport abstraction is necessary (BLE, Wi-Fi Direct, Nostr are very different).
- How `TransportManager` keeps startup resilient even if one native transport fails.
- How `MeshNode` handles link up/down, handshake tie-breaks, and packet routing.
- How diagnostics events help observe behavior in real-time.

### Code snippet A: Unified resilient transport startup

```ts
const inner: TransportEvents = {
  onLinkUp: link => {
    events.onLinkUp(link);
    events.onLinks(this.allLinks());
  },
  onLinkDown: link => {
    events.onLinkDown(link);
    events.onLinks(this.allLinks());
  },
  onPacket: (linkId, bytes) => events.onPacket(linkId, bytes),
  onRssi: (linkId, rssi) => events.onRssi(linkId, rssi),
};
await Promise.allSettled(this.transports.map(t => t.start(inner)));
```

Source: `src/core/transport/transportManager.ts`

### Code snippet B: MeshNode secure message send path

```ts
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
});
this.gossip.emit(packet);
```

Source: `src/core/mesh/meshNode.ts`

### Speaker close line

"My section shows how we made heterogeneous transports behave like one mesh network and connected that runtime behavior to secure message flow."

---

## Presenter 4 - UI, State, and User Experience

### Responsibility

Explain how users interact with mesh data through chat, radar, diagnostics, and persistent message state.

### Suggested talking points

- Platform-aware navigation (`RootNavigator`) for Windows and Android layouts.
- How conversation data is mapped and persisted in `messagesStore`.
- How chat sending falls back gracefully to broadcast when direct secure session is missing.
- How `MeshRadarView` visualizes RSSI/hops and makes the mesh understandable.

### Code snippet A: Conversation persistence by peer key

```ts
const key =
  msg.toPeerId === ZERO_PEER
    ? BROADCAST_KEY
    : msg.fromPeerId === me
      ? msg.toPeerId
      : msg.fromPeerId;
const existing = state.byPeer[key] ?? [];
if (existing.some(m => m.id === msg.id)) return state;
const byPeer = {...state.byPeer, [key]: [...existing, msg]};
AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(byPeer)).catch(() => undefined);
```

Source: `src/state/messagesStore.ts`

### Code snippet B: Chat send behavior with fallback

```ts
if (conversationKey === BROADCAST_KEY) {
  await mesh.sendBroadcastPayload(payload);
} else {
  try {
    await mesh.sendChatPayload(conversationKey, payload);
  } catch (e) {
    // Fallback to broadcast until Noise session exists.
    await mesh.sendBroadcastPayload(payload);
  }
}
```

Source: `src/ui/screens/ChatsRoute.tsx`

### Code snippet C: Radar peer mapping from RSSI

```ts
function rssiToDistance(rssi: number): number {
  if (rssi >= -45) return 0.18;
  if (rssi >= -60) return 0.35;
  if (rssi >= -75) return 0.55;
  if (rssi >= -85) return 0.75;
  return 0.92;
}
```

Source: `src/ui/components/MeshRadarView.tsx`

### Speaker close line

"This part demonstrates that our project is not only technically strong at the protocol layer, but also usable and clear for end users through visual and persistent UX."

---

## 4) Equal Contribution Checklist (Use Before Final Presentation)

- Each member presents 6-8 minutes.
- Each member explains at least 2 code snippets from their section.
- Each member covers both "what it does" and "why we designed it this way."
- Team demo flow:
  1. Start app + show architecture map (Presenter 1)
  2. Explain secure routing logic (Presenter 2)
  3. Show live peer/link behavior and diagnostics (Presenter 3)
  4. Show chat + radar UX and persistence (Presenter 4)

---

## 5) Quick Q&A Preparation

- Why no central server?  
  To demonstrate a decentralized architecture where identity and routing remain peer-driven.

- How do you avoid message loops?  
  Packet IDs are deduplicated via rotating Bloom filter; TTL also limits forwarding depth.

- What happens if direct secure session is unavailable?  
  UI send path falls back to broadcast while session is not established.

- How is this production-ready directionally?  
  Clear module boundaries, protocol tests, transport abstraction, and diagnostics foundation.

