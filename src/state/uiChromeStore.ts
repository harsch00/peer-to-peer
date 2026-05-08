/**
 * Shell + chat focus — drives unread badge (when the user is not looking at that conversation).
 */
import {create} from 'zustand';
import type {RouteId} from '../navigation/routes';

export type AndroidChatLayer = 'list' | 'thread';

interface UiChromeState {
  activeRoute: RouteId;
  setActiveRoute: (route: RouteId) => void;
  /** Windows + Android: which conversation is open in the chat UI. */
  activeChatKey: string | null;
  setActiveChatKey: (key: string | null) => void;
  /** Android: true when the conversation list is showing (not inside a thread). */
  androidChatLayer: AndroidChatLayer;
  setAndroidChatLayer: (layer: AndroidChatLayer) => void;
}

export const useUiChromeStore = create<UiChromeState>(set => ({
  activeRoute: 'chats',
  setActiveRoute: route => set({activeRoute: route}),
  activeChatKey: null,
  setActiveChatKey: key => set({activeChatKey: key}),
  androidChatLayer: 'list',
  setAndroidChatLayer: layer => set({androidChatLayer: layer}),
}));
