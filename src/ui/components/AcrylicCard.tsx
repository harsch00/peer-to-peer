/**
 * AcrylicCard — A reusable card component with Fluent Design glass effects.
 *
 * On Windows: semi-transparent background with glass border stroke and subtle
 * elevation. Uses `windowsBackdrop: 'acrylic'` when available.
 *
 * On Android: falls back to a solid surface color with slight elevation hint.
 */
import React from 'react';
import {Platform, StyleSheet, View, ViewProps, ViewStyle} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';

interface Props extends ViewProps {
  /** Override the glass fill color. */
  fill?: string;
  /** Apply a tighter padding (e.g. for list items). */
  compact?: boolean;
  /** Elevated variant with stronger shadow presence. */
  elevated?: boolean;
  style?: ViewStyle;
}

export function AcrylicCard({fill, compact, elevated, style, children, ...rest}: Props) {
  const theme = useTheme();
  const isWindows = theme.platform === 'windows';

  const glassFill = fill ?? (isWindows ? theme.fluent.acrylicCard : theme.colors.surface);
  const glassBorder = isWindows ? theme.fluent.glassBorderSubtle : theme.colors.border;

  const winProps: any = isWindows && Platform.OS === 'windows'
    ? {windowsBackdrop: 'acrylic'}
    : {};

  return (
    <View
      {...rest}
      {...winProps}
      style={[
        styles.card,
        {
          backgroundColor: glassFill,
          borderColor: glassBorder,
          borderWidth: StyleSheet.hairlineWidth,
          ...(isWindows ? {
            borderRadius: 8,
          } : {
            borderRadius: theme.platform === 'android' ? 24 : 12,
          }),
        },
        compact ? styles.compact : styles.normal,
        elevated && isWindows ? styles.elevated : null,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  normal: {
    padding: 16,
  },
  compact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  elevated: {
    // React Native doesn't support box-shadow, but we approximate with
    // platform-specific elevation. On Windows, the acrylic backdrop
    // already provides visual depth.
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
});
