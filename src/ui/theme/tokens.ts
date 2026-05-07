/**
 * Cross-platform design tokens used by both Fluent (Windows) and M3 (Android)
 * adapters. Anything platform-agnostic lives here.
 */

export const HopColors = {
  /** Direct (0 hops). */
  direct: '#22C55E',
  /** 1 hop. */
  oneHop: '#EAB308',
  /** Multi-hop / weak. */
  weak: '#EF4444',
  /** Unknown / disconnected. */
  unknown: '#64748B',
};

export function colorForHops(hops: number, rssi?: number): string {
  if (hops <= 0) return HopColors.direct;
  if (hops === 1) return HopColors.oneHop;
  if (rssi !== undefined && rssi < -80) return HopColors.weak;
  return HopColors.weak;
}

export const Radii = {
  none: 0,
  small: 8,
  medium: 16,
  large: 24,
  xl: 28, // M3 "extra-large"
  full: 9999,
};

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const Motion = {
  spring: {bouncy: {damping: 12, stiffness: 240, mass: 0.8}},
  drillIn: {duration: 280},
};
