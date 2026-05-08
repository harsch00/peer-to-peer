/**
 * Remote peers' display names / avatar styles, learned from gossip `peer_profile` payloads.
 */
import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {nicknameFor} from '../core/crypto/identity';
import type {AvatarStyle} from '../utils/dicebear';

const STORAGE_KEY = 'p2pmesh.peerDirectory.v1';

const AVATAR_STYLES = new Set<string>(['adventurer', 'bottts', 'lorelei', 'pixel-art']);

export type PeerProfileMeta = {
  displayName: string;
  avatarStyle: AvatarStyle;
  updatedAtMs: number;
};

function normalizeAvatarStyle(s: string): AvatarStyle {
  const t = String(s || '').trim();
  return AVATAR_STYLES.has(t) ? (t as AvatarStyle) : 'bottts';
}

interface PeerDirectoryState {
  byPeer: Record<string, PeerProfileMeta>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  upsert: (peerId: string, displayName: string, avatarStyleRaw: string) => void;
}

function persist(byPeer: Record<string, PeerProfileMeta>) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(byPeer)).catch(() => undefined);
}

export const usePeerDirectoryStore = create<PeerDirectoryState>((set, get) => ({
  byPeer: {},
  hydrated: false,
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      set({hydrated: true, byPeer: raw ? JSON.parse(raw) : {}});
    } catch {
      set({hydrated: true});
    }
  },
  upsert: (peerId, displayName, avatarStyleRaw) => {
    const dn = displayName.trim().slice(0, 64) || nicknameFor(peerId);
    const avatarStyle = normalizeAvatarStyle(avatarStyleRaw);
    const cur = get().byPeer[peerId];
    if (cur && cur.displayName === dn && cur.avatarStyle === avatarStyle) {
      return;
    }
    const next: PeerProfileMeta = {displayName: dn, avatarStyle, updatedAtMs: Date.now()};
    const byPeer = {...get().byPeer, [peerId]: next};
    persist(byPeer);
    set({byPeer});
  },
}));

export function getPeerLabel(peerId: string): string {
  const custom = usePeerDirectoryStore.getState().byPeer[peerId]?.displayName;
  return custom?.trim() || nicknameFor(peerId);
}

export function getPeerAvatarStyle(peerId: string, fallback: AvatarStyle = 'bottts'): AvatarStyle {
  return usePeerDirectoryStore.getState().byPeer[peerId]?.avatarStyle ?? fallback;
}
