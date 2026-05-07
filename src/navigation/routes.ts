/**
 * Single source of truth for the app's nav structure.
 *
 * Both the Windows side-rail and the Android bottom-nav consume this list.
 */
export type RouteId =
  | 'chats'
  | 'radar'
  | 'diagnostics'
  | 'profile'
  | 'settings';

export interface RouteSpec {
  id: RouteId;
  label: string;
  icon: string;
  description: string;
}

export const ROUTES: RouteSpec[] = [
  {id: 'chats', label: 'Chats', icon: 'message-text-outline', description: 'Encrypted conversations'},
  {id: 'radar', label: 'Pulse', icon: 'radar', description: 'Live mesh radar'},
  {id: 'diagnostics', label: 'Diagnostics', icon: 'console', description: 'Network event log'},
  {id: 'profile', label: 'Profile', icon: 'shield-key-outline', description: 'Identity & avatar'},
  {id: 'settings', label: 'Settings', icon: 'cog-outline', description: 'Transports & preferences'},
];
