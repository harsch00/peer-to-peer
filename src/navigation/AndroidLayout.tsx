/**
 * Android Material 3 bottom-nav shell.
 *
 * Uses a navigation bar with the 28dp "Extra-Large" rounded indicator pill
 * behind the active item. The top app bar collapses elegantly into a thin
 * strip on scroll (handled per-route via Reanimated).
 */
import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../ui/theme/ThemeProvider';
import {ROUTES, RouteId} from './routes';
import {ChatsRoute} from '../ui/screens/ChatsRoute';
import {RadarScreen} from '../ui/screens/RadarScreen';
import {DiagnosticsScreen} from '../ui/screens/DiagnosticsScreen';
import {ProfileScreen} from '../ui/screens/ProfileScreen';
import {SettingsScreen} from '../ui/screens/SettingsScreen';

export function AndroidLayout() {
  const theme = useTheme();
  const [route, setRoute] = useState<RouteId>('chats');

  return (
    <View style={[styles.root, {backgroundColor: theme.colors.bg}]}>
      <View style={{flex: 1}}>
        <RouteContent route={route} />
      </View>

      <View
        style={[
          styles.bottomNav,
          {
            backgroundColor: theme.m3.surfaceContainer,
            borderTopColor: theme.colors.border,
          },
        ]}>
        {ROUTES.map(r => (
          <NavItem
            key={r.id}
            spec={r}
            active={route === r.id}
            onPress={() => setRoute(r.id)}
          />
        ))}
      </View>
    </View>
  );
}

function NavItem({
  spec,
  active,
  onPress,
}: {
  spec: typeof ROUTES[number];
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [
        styles.navItem,
        {opacity: pressed ? 0.85 : 1},
      ]}>
      <View
        style={[
          styles.navPill,
          {
            backgroundColor: active ? theme.m3.secondaryContainer : 'transparent',
          },
        ]}>
        <Text
          style={{
            color: active ? theme.m3.onSecondaryContainer : theme.colors.textMuted,
            fontSize: 13,
            fontWeight: active ? '700' : '500',
            fontFamily: theme.fontFamily,
          }}>
          {/* Use the first 2 letters as a tiny "icon" stand-in. The real app
              would use react-native-vector-icons here. */}
          {spec.label.slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <Text
        style={{
          color: active ? theme.colors.text : theme.colors.textMuted,
          fontSize: 11,
          marginTop: 4,
          fontFamily: theme.fontFamily,
        }}>
        {spec.label}
      </Text>
    </Pressable>
  );
}

function RouteContent({route}: {route: RouteId}) {
  switch (route) {
    case 'chats':
      return <ChatsRoute layout="android" />;
    case 'radar':
      return <RadarScreen />;
    case 'diagnostics':
      return <DiagnosticsScreen />;
    case 'profile':
      return <ProfileScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}

const styles = StyleSheet.create({
  root: {flex: 1},
  bottomNav: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderTopWidth: 0.5,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  navPill: {
    width: 56,
    height: 32,
    borderRadius: 28, // M3 "extra-large"
    alignItems: 'center',
    justifyContent: 'center',
  },
});
