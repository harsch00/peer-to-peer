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
  /** Single character for `Segoe MDL2 Assets` / Fluent-style rail glyphs on Windows. */
  mdl2: string;
  description: string;
}

export const ROUTES: RouteSpec[] = [
  {id: 'chats', label: 'Chats', icon: 'message-text-outline', mdl2: '\uE8BD', description: 'Encrypted conversations'},
  {id: 'radar', label: 'Pulse', icon: 'radar', mdl2: '\uEBD2', description: 'Live mesh radar'},
  {id: 'diagnostics', label: 'Diagnostics', icon: 'console', mdl2: '\uEBE8', description: 'Network event log'},
  {id: 'profile', label: 'Profile', icon: 'shield-key-outline', mdl2: '\uE77B', description: 'Identity & avatar'},
  {id: 'settings', label: 'Settings', icon: 'cog-outline', mdl2: '\uE713', description: 'Transports & preferences'},
];
