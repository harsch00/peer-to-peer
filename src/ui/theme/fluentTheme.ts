/**
 * Windows 11 Fluent theme tokens.
 *
 * We deliberately mirror the Fluent Design "Mica" + "Acrylic" palette so the
 * app feels native on Windows. The actual Mica/Acrylic backdrop is applied
 * via a host XAML brush in `MicaBackground.tsx`; here we only set foreground
 * tokens that compose on top of those translucent surfaces.
 */
export const FluentTokens = {
  fontFamily: 'Segoe UI Variable',
  fontFamilyDisplay: 'Segoe UI Variable Display',
  fontFamilyMono: 'Cascadia Mono, Consolas, monospace',

  // Light theme tokens (the system can flip to dark via useColorScheme()).
  light: {
    bgFill: 'rgba(243, 243, 243, 0.78)', // mica tint
    bgFillSecondary: 'rgba(255, 255, 255, 0.6)',
    bgFillTertiary: 'rgba(0, 0, 0, 0.04)',
    sidebarFill: 'rgba(252, 252, 252, 0.55)', // acrylic
    accent: '#0F6CBD', // Fluent communication blue
    accentHover: '#115EA3',
    text: '#1F1F1F',
    textSecondary: '#5C5C5C',
    border: 'rgba(0, 0, 0, 0.0578)',
    cardElev: 'rgba(255, 255, 255, 0.7)',
    chip: 'rgba(15, 108, 189, 0.10)',
    danger: '#C42B1C',
    success: '#0F7B0F',
  },

  dark: {
    bgFill: 'rgba(32, 32, 32, 0.72)',
    bgFillSecondary: 'rgba(43, 43, 43, 0.6)',
    bgFillTertiary: 'rgba(255, 255, 255, 0.05)',
    sidebarFill: 'rgba(20, 20, 20, 0.55)',
    accent: '#60CDFF',
    accentHover: '#4CC2FF',
    text: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    border: 'rgba(255, 255, 255, 0.0837)',
    cardElev: 'rgba(255, 255, 255, 0.04)',
    chip: 'rgba(96, 205, 255, 0.16)',
    danger: '#FF99A4',
    success: '#6CCB5F',
  },

  type: {
    caption: {fontSize: 12, lineHeight: 16, fontWeight: '400' as const},
    body: {fontSize: 14, lineHeight: 20, fontWeight: '400' as const},
    bodyStrong: {fontSize: 14, lineHeight: 20, fontWeight: '600' as const},
    subtitle: {fontSize: 20, lineHeight: 28, fontWeight: '600' as const},
    title: {fontSize: 28, lineHeight: 36, fontWeight: '600' as const},
    titleLarge: {fontSize: 40, lineHeight: 52, fontWeight: '700' as const},
  },

  motion: {
    drillIn: {duration: 280, easing: 'cubic-bezier(0.05, 0.7, 0.1, 1.0)'},
    fadeIn: {duration: 167, easing: 'cubic-bezier(0.0, 0.0, 1.0, 1.0)'},
  },

  shadow: {
    elevation2: '0px 1px 2px rgba(0, 0, 0, 0.14)',
    elevation8: '0px 4px 8px rgba(0, 0, 0, 0.14)',
    elevation16: '0px 8px 16px rgba(0, 0, 0, 0.18)',
  },
} as const;

export type FluentPalette = typeof FluentTokens.light;
