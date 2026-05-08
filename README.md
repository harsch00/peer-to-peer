# p2p-mesh

A high-end, fully-decentralized **peer-to-peer mesh messenger** for Windows 11
and Android. There are no servers, no email accounts, and no phone numbers —
identities are cryptographic key pairs generated on-device and conversations
are routed through a Bitchat-style gossip mesh secured by the Noise Protocol.

```
                ┌──────────┐
   BLE ────────▶│          │◀──────── Wi-Fi Direct
                │ MeshNode │
   Nostr ──────▶│          │◀──────── Simulator
                └────┬─────┘
                     │
            ┌────────┴────────┐
            │   gossip+TTL    │
            │  rotating bloom │
            │ Noise XX 25519  │
            │  AES-256-GCM    │
            └─────────────────┘
```

## What ships

### Core protocol (Phase 1)
* **Noise Protocol Framework — XX pattern** (`Noise_XX_25519_AESGCM_SHA256`).
  See `src/core/crypto/noise.ts` for the full handshake state machine.
* **Bitchat-style packet format** with 8-bit TTL, 16-byte packet IDs, sender
  / recipient peer IDs, and an inline path field for path-tracing.
* **Optimized double-hash Bloom filter** (Kirsch–Mitzenmacher) with rotating
  windows so the dedup table never grows unbounded.
* **Store-and-forward gossip router** that drops duplicates, decrements TTL,
  delivers to local recipients, and queues unicast packets for offline peers.
* **Local, account-less identities** derived from a single 32-byte
  Curve25519 secret. SHA-256 fingerprint is used for QR verification.

### Transports (Phase 1)
* **`BleTransport`** — `react-native-ble-plx` based, Bitchat service UUIDs,
  graceful degradation on platforms without BT.
* **`WifiDirectTransport`** — Android Wi-Fi P2P / Windows Wi-Fi Aware adapter
  via a thin `NativeModules.P2PWifiDirect` bridge.
* **`NostrTransport`** — internet "carrier wave" using NIP-01 events on
  `wss://relay.damus.io`, `wss://nos.lol`, and `wss://relay.snort.social`.
* **`SimulatorTransport`** — synthesizes peers, RSSI jitter, and link churn so
  the radar / chat / diagnostics views are alive even with no real radios.

### UI shell (Phase 2)
* **Windows**: three-pane layout with a **Mica** main backdrop and **Acrylic**
  navigation rail, hover-elevated nav items, **Segoe UI Variable** type ramp,
  and Drill-In transitions between routes.
* **Android**: M3 "Expressive" bottom nav, 28dp Extra-Large rounded
  surfaces, full-rounding pill action buttons, dynamic Monet palette
  hook (falls back to a tasteful seed when the system can't provide one).

### Pulse Mesh Radar (Phase 3)
* `MeshRadarView.tsx` — `react-native-svg` + `react-native-reanimated` 60 fps
  pulses, sine-wave node drift, expanding sweep ring, RSSI-mapped distance,
  hop-color edges (Direct = green, 1-Hop = yellow, multi-hop = red).

### Chat (Phase 4)
* Encrypted unicast through Noise CipherStates and a public broadcast
  channel.
* **`MessageBubble`** with hop / latency badges and a tappable
  **`PathTraceChip`** that opens a mini-map of the exact route every packet
  took.
* Bouncy spring animation + **haptic feedback** on long-press
  (`react-native-haptic-feedback`).

### Visual feature roadmap
| Feature | File |
|---|---|
| A · Pulse Mesh Radar | `src/ui/components/MeshRadarView.tsx` |
| B · Path-Tracing | `src/ui/components/PathTraceChip.tsx` |
| C · Diagnostic Dashboard | `src/ui/components/DiagnosticLog.tsx` + screen |
| D · Identity & Avatar | `src/utils/dicebear.ts` + `PeerAvatar.tsx` |
| E · Signal & Reliability | `src/ui/components/SignalBar.tsx` |

## Getting started

```bash
npm install

# Android (real device or emulator)
npm run android

# Windows 11 desktop
npm run windows

# Run unit tests (Noise round-trip, Bloom, packet codec)
npm test

# Strict typecheck
npm run typecheck
```

> The `react-native-windows` and `react-native-ble-plx` packages require their
> respective native projects to be initialized once. Follow their readmes if
> you don't already have a `windows/` or fully-configured `android/` folder.

## Architecture

```
src/
├── core/
│   ├── crypto/            # Noise XX, X25519 identities
│   ├── protocol/          # Bitchat packet, Bloom, gossip
│   ├── transport/         # BLE / Wi-Fi Direct / Nostr / simulator
│   └── mesh/              # MeshNode + bootstrap
├── state/                 # Zustand stores (peers, messages, diagnostics)
├── navigation/            # Platform shells (Windows 3-pane, Android bottom)
└── ui/
    ├── theme/             # Fluent + M3 + unified provider
    ├── components/        # Radar, message bubble, signal bar, …
    └── screens/           # Chats, Radar, Diagnostics, Profile, Settings
```

## Design philosophy

* **No accounts.** Ever. Your identity lives only in `~/.p2p-mesh` (or the
  platform secure store) — never on a server.
* **Privacy first.** Diagnostic logs can be configured to mask peer IDs.
  Nostr signing keys are unlinked from the mesh identity.
* **Resilience over speed.** TTL + Bloom + store-and-forward means messages
  survive transient outages and route around hostile nodes.
* **Beautiful where it matters.** Fluent on Windows, M3 Expressive on Android,
  rendered through the same theme provider so every component looks
  natively at home on either OS.

## License

MIT — see [`LICENSE`](LICENSE).
