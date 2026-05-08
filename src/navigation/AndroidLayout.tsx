/**
 * Android Material 3 bottom-nav shell.
 *
 * Uses a navigation bar with the 28dp "Extra-Large" rounded indicator pill
 * behind the active item. The top app bar collapses elegantly into a thin
 * strip on scroll (handled per-route via Reanimated).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../ui/theme/ThemeProvider';
import {ROUTES, RouteId} from './routes';
import {ChatsRoute} from '../ui/screens/ChatsRoute';
import {RadarScreen} from '../ui/screens/RadarScreen';
import {DiagnosticsScreen} from '../ui/screens/DiagnosticsScreen';
import {ProfileScreen} from '../ui/screens/ProfileScreen';
import {SettingsScreen} from '../ui/screens/SettingsScreen';
import {M3BottomNavIcon} from '../ui/icons/M3BottomNavIcon';
import {useMessagesStore} from '../state/messagesStore';
import {useUiChromeStore} from '../state/uiChromeStore';

export function AndroidLayout() {
  const theme = useTheme();
  const [route, setRoute] = useState<RouteId>('chats');
  const chatsUnread = useMessagesStore(s => s.chatsUnread);

  useEffect(() => {
    useUiChromeStore.getState().setActiveRoute('chats');
  }, []);

  const navigate = useCallback((r: RouteId) => {
    useUiChromeStore.getState().setActiveRoute(r);
    if (r === 'chats') {
      useMessagesStore.getState().clearChatsUnread();
    }
    setRoute(r);
  }, []);

  return (
    <View style={[styles.root, {backgroundColor: theme.colors.bg}]}>
      <View style={{flex: 1}}>
        <RouteContent route={route} />
      </View>

      <View
        style={[
          styles.bottomNav,
          {
            backgroundColor: theme.m3.surfaceContainerHigh,
            borderTopColor: theme.colors.border,
          },
        ]}>
        {ROUTES.map(r => (
          <NavItem
            key={r.id}
            spec={r}
            active={route === r.id}
            badgeCount={r.id === 'chats' ? chatsUnread : 0}
            onPress={() => navigate(r.id)}
          />
        ))}
      </View>
    </View>
  );
}

function NavItem({
  spec,
  active,
  badgeCount = 0,
  onPress,
}: {
  spec: (typeof ROUTES)[number];
  active: boolean;
  badgeCount?: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [
        styles.navItem,
        {opacity: pressed ? 0.88 : 1},
      ]}>
      <View
        style={[
          styles.navPill,
          {
            backgroundColor: active ? theme.m3.primaryContainer : 'transparent',
            transform: [{scale: active ? 1.04 : 1}],
          },
        ]}>
        <View style={{position: 'relative'}}>
          <M3BottomNavIcon route={spec.id} active={active} />
          {badgeCount > 0 ? (
            <View
              style={{
                position: 'absolute',
                right: -6,
                top: -4,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                paddingHorizontal: 4,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accent,
              }}>
              <Text
                style={{
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: '800',
                  fontFamily: theme.fontFamilyMono,
                }}>
                {badgeCount > 99 ? '99+' : badgeCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text
        style={{
          color: active ? theme.m3.primary : theme.colors.textMuted,
          fontSize: 11,
          marginTop: 5,
          fontFamily: theme.fontFamily,
          fontWeight: active ? '700' : '500',
          letterSpacing: active ? 0.15 : 0,
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
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  navPill: {
    width: 64,
    height: 36,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
