/**
 * Unified theme provider. Selects Fluent vs M3 based on Platform.OS and
 * exposes a single `useTheme()` hook the rest of the app can rely on.
 */
import React, {createContext, useContext, useMemo} from 'react';
import {Platform, useColorScheme} from 'react-native';
import {FluentTokens} from './fluentTheme';
import {M3Defaults, M3Palette, resolveM3Palette} from './m3Theme';
import {Radii, Spacing} from './tokens';

export type Scheme = 'light' | 'dark';

interface UnifiedTheme {
  platform: 'windows' | 'android' | 'other';
  scheme: Scheme;
  fluent: typeof FluentTokens.light;
  m3: M3Palette;
  fontFamily: string;
  fontFamilyMono: string;
  // Convenience top-level palette that adapts to both platforms:
  colors: {
    bg: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    textMuted: string;
    accent: string;
    accentSoft: string;
    border: string;
    danger: string;
    success: string;
  };
  radii: typeof Radii;
  spacing: typeof Spacing;
}

const ThemeContext = createContext<UnifiedTheme | null>(null);

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const scheme = (useColorScheme() ?? 'dark') as Scheme;
  const value = useMemo<UnifiedTheme>(() => {
    const platform: UnifiedTheme['platform'] =
      Platform.OS === 'windows' ? 'windows' : Platform.OS === 'android' ? 'android' : 'other';
    const fluent = scheme === 'dark' ? FluentTokens.dark : FluentTokens.light;
    const m3 = resolveM3Palette(scheme);
    if (platform === 'windows') {
      return {
        platform,
        scheme,
        fluent,
        m3,
        fontFamily: FluentTokens.fontFamily,
        fontFamilyMono: FluentTokens.fontFamilyMono,
        colors: {
          bg: fluent.bgFill,
          surface: fluent.bgFillSecondary,
          surfaceAlt: fluent.bgFillTertiary,
          text: fluent.text,
          textMuted: fluent.textSecondary,
          accent: fluent.accent,
          accentSoft: fluent.chip,
          border: fluent.border,
          danger: fluent.danger,
          success: fluent.success,
        },
        radii: Radii,
        spacing: Spacing,
      };
    }
    // Android / other → M3
    return {
      platform,
      scheme,
      fluent,
      m3,
      fontFamily: 'Roboto',
      fontFamilyMono: 'monospace',
      colors: {
        bg: m3.background,
        surface: m3.surfaceContainer,
        surfaceAlt: m3.surfaceContainerHigh,
        text: m3.onBackground,
        textMuted: m3.onSurfaceVariant,
        accent: m3.primary,
        accentSoft: m3.primaryContainer,
        border: m3.outlineVariant,
        danger: m3.error,
        success: '#16A34A',
      },
      radii: Radii,
      spacing: Spacing,
    };
  }, [scheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): UnifiedTheme {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}

export {M3Defaults};
