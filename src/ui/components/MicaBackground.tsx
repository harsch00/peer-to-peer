/**
 * Mica / Acrylic backdrop wrapper.
 *
 * On Windows we pass `viewProps` through to the host XAML view via the
 * `react-native-windows` `windowsBackdrop` prop. On other platforms we just
 * render a tinted background that approximates the same look.
 */
import React from 'react';
import {Platform, View, ViewProps, ViewStyle} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';

interface Props extends ViewProps {
  variant?: 'mica' | 'acrylic';
  style?: ViewStyle;
}

export function MicaBackground({variant = 'mica', style, children, ...rest}: Props) {
  const theme = useTheme();
  const isWindows = Platform.OS === 'windows';
  const isAcrylic = variant === 'acrylic';

  // The cast keeps TS happy on platforms where `windowsBackdrop` isn't typed.
  const winProps: any = isWindows
    ? {windowsBackdrop: isAcrylic ? 'acrylic' : 'mica'}
    : {};

  const fallbackBg = isAcrylic ? theme.fluent.sidebarFill : theme.fluent.bgFill;

  return (
    <View
      {...rest}
      {...winProps}
      style={[
        {
          flex: 1,
          backgroundColor: isWindows ? 'transparent' : fallbackBg,
        },
        style,
      ]}>
      {children}
    </View>
  );
}
