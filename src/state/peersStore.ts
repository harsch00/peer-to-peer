/**
 * Peer / link state. Backed by Zustand for cheap subscriptions.
 */
import {create} from 'zustand';
import type {PeerLink} from '../core/transport/types';
import type {PeerIdentity} from '../core/crypto/identity';

interface PeersState {
  identity: PeerIdentity | null;
  peers: PeerLink[];
  setIdentity: (id: PeerIdentity) => void;
  setPeers: (peers: PeerLink[]) => void;
}

export const usePeersStore = create<PeersState>(set => ({
  identity: null,
  peers: [],
  setIdentity: id => set({identity: id}),
  setPeers: peers => set({peers}),
}));
