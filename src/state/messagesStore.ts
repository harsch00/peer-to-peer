/**
 * Conversation / message log.
 *
 * Conversations are keyed by the "other party's" peer ID. Broadcast messages
 * (recipient = ZERO_PEER) live under the special `broadcast` key.
 */
import {create} from 'zustand';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {ChatMessage} from '../core/mesh/meshNode';
import {usePeersStore} from './peersStore';
import {useUiChromeStore} from './uiChromeStore';
import {ZERO_PEER} from '../core/protocol/packet';
import {notifyMeshMessageForegroundDisabled} from '../notifications/meshLocalNotify';

export const BROADCAST_KEY = 'broadcast';
const STORAGE_KEY = 'p2pmesh.messages.v1';

interface MessagesState {
  byPeer: Record<string, ChatMessage[]>;
  hydrated: boolean;
  /** Badge count for the Chats tab when messages arrive off-focus. */
  chatsUnread: number;
  unreadByPeer: Record<string, number>;
  hydrate: () => Promise<void>;
  push: (msg: ChatMessage) => void;
  clear: (peerId: string) => void;
  removeMessage: (conversationKey: string, messageId: string) => void;
  clearChatsUnread: () => void;
  clearConversationUnread: (peerId: string) => void;
}

function conversationKeyForMessage(msg: ChatMessage): string {
  const me = usePeersStore.getState().identity?.peerId;
  return msg.toPeerId === ZERO_PEER
    ? BROADCAST_KEY
    : msg.fromPeerId === me
      ? msg.toPeerId
      : msg.fromPeerId;
}

function shouldIncrementChatsUnread(msg: ChatMessage): boolean {
  const me = usePeersStore.getState().identity?.peerId;
  if (!me || msg.fromPeerId === me) {
    return false;
  }
  if (msg.payload.kind === 'reaction' || msg.payload.kind === 'poll_vote' || msg.payload.kind === 'peer_profile' || msg.payload.kind === 'file_transfer_chunk' || msg.payload.kind === 'file_transfer_complete') {
    return false;
  }
  const key = conversationKeyForMessage(msg);
  const chrome = useUiChromeStore.getState();
  if (chrome.activeRoute !== 'chats') {
    return true;
  }
  if (Platform.OS === 'android' && chrome.androidChatLayer === 'list') {
    return true;
  }
  if (chrome.activeChatKey !== key) {
    return true;
  }
  return false;
}

function persist(byPeer: Record<string, ChatMessage[]>) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(byPeer)).catch(() => undefined);
}

function mergeReactionIntoState(state: MessagesState, reactionMsg: ChatMessage): MessagesState {
  if (reactionMsg.payload.kind !== 'reaction') return state;
  const {messageId, emoji} = reactionMsg.payload;
  const from = reactionMsg.fromPeerId;
  const byPeer = {...state.byPeer};
  let changed = false;
  for (const key of Object.keys(byPeer)) {
    const list = byPeer[key];
    const idx = list.findIndex(m => m.id === messageId);
    if (idx < 0) continue;
    const target = list[idx];
    const prev = target.reactions ?? [];
    const dup = prev.findIndex(r => r.fromPeerId === from && r.emoji === emoji);
    let nextReactions: typeof prev;
    if (dup >= 0) {
      nextReactions = prev.filter((_, i) => i !== dup);
    } else {
      nextReactions = [...prev, {emoji, fromPeerId: from}];
    }
    const updatedList = [...list];
    updatedList[idx] = {...target, reactions: nextReactions};
    byPeer[key] = updatedList;
    changed = true;
    break;
  }
  if (!changed) return state;
  persist(byPeer);
  return {...state, byPeer};
}

function mergePollVoteIntoState(state: MessagesState, voteMsg: ChatMessage): MessagesState {
  if (voteMsg.payload.kind !== 'poll_vote') return state;
  const {pollId, optionId} = voteMsg.payload;
  const from = voteMsg.fromPeerId;
  const key = conversationKeyForMessage(voteMsg);
  const list = state.byPeer[key];
  if (!list) return state;
  const idx = list.findIndex(m => m.payload.kind === 'poll' && m.payload.pollId === pollId);
  if (idx < 0) return state;
  const target = list[idx];
  const pollVotes = {...(target.pollVotes ?? {}), [from]: optionId};
  const updatedList = [...list];
  updatedList[idx] = {...target, pollVotes};
  const byPeer = {...state.byPeer, [key]: updatedList};
  persist(byPeer);
  return {...state, byPeer};
}

export const useMessagesStore = create<MessagesState>(set => ({
  hydrated: false,
  byPeer: {},
  chatsUnread: 0,
  unreadByPeer: {},
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      set({hydrated: true, byPeer: raw ? JSON.parse(raw) : {}});
    } catch {
      set({hydrated: true});
    }
  },
  clearChatsUnread: () => set({chatsUnread: 0}),
  clearConversationUnread: peerId =>
    set(state => {
      if (!state.unreadByPeer[peerId]) return state;
      const unreadByPeer = {...state.unreadByPeer};
      delete unreadByPeer[peerId];
      return {unreadByPeer};
    }),
  push: msg =>
    set(state => {
      if (msg.payload.kind === 'reaction') {
        return mergeReactionIntoState(state, msg);
      }
      if (msg.payload.kind === 'poll_vote') {
        return mergePollVoteIntoState(state, msg);
      }
      if (msg.payload.kind === 'peer_profile') {
        return state;
      }
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
      persist(byPeer);
      const bump = shouldIncrementChatsUnread(msg);
      const chatsUnread = bump ? state.chatsUnread + 1 : state.chatsUnread;
      const unreadByPeer = bump
        ? {...state.unreadByPeer, [key]: (state.unreadByPeer[key] ?? 0) + 1}
        : state.unreadByPeer;
      if (bump) {
        void notifyMeshMessageForegroundDisabled('p2p mesh', msg.body || 'New message');
      }
      return {byPeer, chatsUnread, unreadByPeer};
    }),
  clear: peerId =>
    set(state => {
      const next = {...state.byPeer};
      delete next[peerId];
      persist(next);
      return {byPeer: next};
    }),
  removeMessage: (conversationKey, messageId) =>
    set(state => {
      const list = state.byPeer[conversationKey];
      if (!list) return state;
      const nextList = list.filter(m => m.id !== messageId);
      if (nextList.length === list.length) return state;
      const byPeer = {...state.byPeer, [conversationKey]: nextList};
      persist(byPeer);
      return {byPeer};
    }),
}));
