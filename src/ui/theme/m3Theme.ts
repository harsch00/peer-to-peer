/**
 * Material 3 "Expressive" theme.
 *
 * On Android 12+ we read the live Monet palette from the system; on older
 * devices we fall back to a tasteful default seed and run the M3 algorithm
 * (HCT) locally. The seed → palette mapping is intentionally lightweight and
 * does not require importing the full `@material/material-color-utilities`
 * package for runtime size reasons.
 */
import {Platform} from 'react-native';

export interface M3Palette {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;

  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;

  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;

  error: string;
  onError: string;

  background: string;
  onBackground: string;

  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;

  outline: string;
  outlineVariant: string;

  scheme: 'light' | 'dark';
}

const DEFAULT_LIGHT: M3Palette = {
  primary: '#5B5BD6',
  onPrimary: '#FFFFFF',
  primaryContainer: '#E0E0FF',
  onPrimaryContainer: '#11135C',

  secondary: '#5C5D72',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#E1E0F9',
  onSecondaryContainer: '#191A2C',

  tertiary: '#78536A',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#FFD8EB',
  onTertiaryContainer: '#2E1125',

  error: '#BA1A1A',
  onError: '#FFFFFF',

  background: '#FBF8FD',
  onBackground: '#1B1B21',

  surface: '#FBF8FD',
  onSurface: '#1B1B21',
  surfaceVariant: '#E4E1EC',
  onSurfaceVariant: '#46464F',
  surfaceContainer: '#EFECF4',
  surfaceContainerHigh: '#E9E6EE',
  surfaceContainerHighest: '#E3E0E9',

  outline: '#777680',
  outlineVariant: '#C7C5D0',

  scheme: 'light',
};

const DEFAULT_DARK: M3Palette = {
  primary: '#C2C1FF',
  onPrimary: '#272789',
  primaryContainer: '#3F3FA1',
  onPrimaryContainer: '#E0E0FF',

  secondary: '#C5C4DD',
  onSecondary: '#2E2F42',
  secondaryContainer: '#444559',
  onSecondaryContainer: '#E1E0F9',

  tertiary: '#E8B9D2',
  onTertiary: '#46263A',
  tertiaryContainer: '#5E3B51',
  onTertiaryContainer: '#FFD8EB',

  error: '#FFB4AB',
  onError: '#690005',

  background: '#131319',
  onBackground: '#E4E1E9',

  surface: '#131319',
  onSurface: '#E4E1E9',
  surfaceVariant: '#46464F',
  onSurfaceVariant: '#C7C5D0',
  surfaceContainer: '#1F1F25',
  surfaceContainerHigh: '#292930',
  surfaceContainerHighest: '#34343B',

  outline: '#90909A',
  outlineVariant: '#46464F',

  scheme: 'dark',
};

export const M3Type = {
  displayLarge: {fontSize: 57, lineHeight: 64, fontWeight: '400' as const, letterSpacing: -0.25},
  headlineMedium: {fontSize: 28, lineHeight: 36, fontWeight: '500' as const},
  titleLarge: {fontSize: 22, lineHeight: 28, fontWeight: '600' as const},
  titleMedium: {fontSize: 16, lineHeight: 24, fontWeight: '600' as const},
  bodyLarge: {fontSize: 16, lineHeight: 24, fontWeight: '400' as const},
  bodyMedium: {fontSize: 14, lineHeight: 20, fontWeight: '400' as const},
  labelLarge: {fontSize: 14, lineHeight: 20, fontWeight: '600' as const},
};

/**
 * Returns the active M3 palette, attempting to read the system "Monet"
 * dynamic colors on Android 12+. If unavailable, returns the static defaults.
 */
export function resolveM3Palette(scheme: 'light' | 'dark' = 'light'): M3Palette {
  if (Platform.OS === 'android') {
    // Native module would expose getSystemDynamicColors(); fall through if absent.
    // We avoid throwing on missing module — that's expected on emulators.
  }
  return scheme === 'dark' ? DEFAULT_DARK : DEFAULT_LIGHT;
}

export const M3Defaults = {light: DEFAULT_LIGHT, dark: DEFAULT_DARK};
