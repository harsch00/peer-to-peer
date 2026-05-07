/**
 * Durable local profile state. The cryptographic identity never leaves the
 * device; we persist only the private key needed to keep the same peer ID.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {create} from 'zustand';
import {
  generateIdentity,
  IdentityCodec,
  nicknameFor,
  PeerIdentity,
} from '../core/crypto/identity';
import type {AvatarStyle} from '../utils/dicebear';

const STORAGE_KEY = 'p2pmesh.profile.v1';

export interface LocalProfile {
  identity: PeerIdentity;
  displayName: string;
  avatarStyle: AvatarStyle;
}

interface StoredProfile {
  privateKey: string;
  displayName: string;
  avatarStyle: AvatarStyle;
}

interface ProfileState {
  hydrated: boolean;
  profile: LocalProfile | null;
  hydrate: () => Promise<LocalProfile>;
  setDisplayName: (displayName: string) => Promise<void>;
  setAvatarStyle: (avatarStyle: AvatarStyle) => Promise<void>;
  regenerateIdentity: () => Promise<LocalProfile>;
}

function defaultProfile(): LocalProfile {
  const identity = generateIdentity();
  return {
    identity,
    displayName: nicknameFor(identity.peerId),
    avatarStyle: 'adventurer',
  };
}

async function persist(profile: LocalProfile) {
  const payload: StoredProfile = {
    privateKey: IdentityCodec.toHex(profile.identity).sk,
    displayName: profile.displayName,
    avatarStyle: profile.avatarStyle,
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Keep the in-memory profile usable even when platform storage is missing.
  }
}

async function readStoredProfile(): Promise<LocalProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredProfile>;
    if (!parsed.privateKey) return null;
    const identity = IdentityCodec.fromHex(parsed.privateKey);
    return {
      identity,
      displayName: parsed.displayName?.trim() || nicknameFor(identity.peerId),
      avatarStyle: parsed.avatarStyle ?? 'adventurer',
    };
  } catch {
    return null;
  }
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  hydrated: false,
  profile: null,

  hydrate: async () => {
    const existing = await readStoredProfile();
    const profile = existing ?? defaultProfile();
    if (!existing) await persist(profile);
    set({hydrated: true, profile});
    return profile;
  },

  setDisplayName: async displayName => {
    const current = get().profile ?? (await get().hydrate());
    const profile = {
      ...current,
      displayName: displayName.trim() || nicknameFor(current.identity.peerId),
    };
    await persist(profile);
    set({profile});
  },

  setAvatarStyle: async avatarStyle => {
    const current = get().profile ?? (await get().hydrate());
    const profile = {...current, avatarStyle};
    await persist(profile);
    set({profile});
  },

  regenerateIdentity: async () => {
    const current = get().profile;
    const identity = generateIdentity();
    const profile: LocalProfile = {
      identity,
      displayName: current?.displayName?.trim() || nicknameFor(identity.peerId),
      avatarStyle: current?.avatarStyle ?? 'adventurer',
    };
    await persist(profile);
    set({hydrated: true, profile});
    return profile;
  },
}));
