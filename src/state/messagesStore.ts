/**
 * Conversation / message log.
 *
 * Conversations are keyed by the "other party's" peer ID. Broadcast messages
 * (recipient = ZERO_PEER) live under the special `broadcast` key.
 */
import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {ChatMessage} from '../core/mesh/meshNode';
import {usePeersStore} from './peersStore';
import {ZERO_PEER} from '../core/protocol/packet';

export const BROADCAST_KEY = 'broadcast';
const STORAGE_KEY = 'p2pmesh.messages.v1';

interface MessagesState {
  byPeer: Record<string, ChatMessage[]>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  push: (msg: ChatMessage) => void;
  clear: (peerId: string) => void;
}

export const useMessagesStore = create<MessagesState>(set => ({
  hydrated: false,
  byPeer: {},
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      set({hydrated: true, byPeer: raw ? JSON.parse(raw) : {}});
    } catch {
      set({hydrated: true});
    }
  },
  push: msg =>
    set(state => {
      const me = usePeersStore.getState().identity?.peerId;
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
      return {byPeer};
    }),
  clear: peerId =>
    set(state => {
      const next = {...state.byPeer};
      delete next[peerId];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
      return {byPeer: next};
    }),
}));
