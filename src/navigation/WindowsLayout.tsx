/**
 * Windows 11 three-pane "shell" layout.
 *
 *   ┌────────┬─────────────────┬────────────────────────────┐
 *   │ rail   │ conversation    │ active chat / route body   │
 *   │ (acryl)│ list (mica)     │                            │
 *   └────────┴─────────────────┴────────────────────────────┘
 *
 * The conversation list pane only appears for the chat route — the radar,
 * diagnostics, profile, and settings routes use the second + third panes
 * fused into a single content area.
 */
import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View, ViewStyle} from 'react-native';
import {MicaBackground} from '../ui/components/MicaBackground';
import {useTheme} from '../ui/theme/ThemeProvider';
import {ROUTES, RouteId} from './routes';
import {ChatsRoute} from '../ui/screens/ChatsRoute';
import {RadarScreen} from '../ui/screens/RadarScreen';
import {DiagnosticsScreen} from '../ui/screens/DiagnosticsScreen';
import {ProfileScreen} from '../ui/screens/ProfileScreen';
import {SettingsScreen} from '../ui/screens/SettingsScreen';

export function WindowsLayout() {
  const theme = useTheme();
  const [route, setRoute] = useState<RouteId>('chats');
  const [railExpanded, setRailExpanded] = useState(true);
  const [chatListWidth, setChatListWidth] = useState(320);
  const railWidth = railExpanded ? 240 : 64;

  return (
    <View style={[styles.root, {backgroundColor: 'transparent'}]}>
      <MicaBackground
        variant="acrylic"
        style={[styles.rail, {borderRightColor: theme.colors.border, width: railWidth} as ViewStyle]}>
        <Pressable
          onPress={() => setRailExpanded(value => !value)}
          style={[styles.collapseButton, {borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt}]}>
          <Text style={{color: theme.colors.text, fontFamily: theme.fontFamilyMono}}>
            {railExpanded ? '<<' : '>>'}
          </Text>
        </Pressable>
        <Text
          style={{
            fontFamily: theme.fontFamily,
            color: theme.colors.text,
            fontSize: 18,
            fontWeight: '600',
            paddingHorizontal: railExpanded ? 16 : 8,
            paddingTop: 24,
            paddingBottom: 12,
            letterSpacing: 0.3,
          }}>
          {railExpanded ? 'P2P · Mesh' : 'P2P'}
        </Text>
        {ROUTES.map(r => (
          <RailItem
            key={r.id}
            spec={r}
            active={route === r.id}
            compact={!railExpanded}
            onPress={() => setRoute(r.id)}
          />
        ))}
        <View style={{flex: 1}} />
        {route === 'chats' && railExpanded ? (
          <View style={[styles.paneControls, {borderColor: theme.colors.border}]}>
            <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamilyMono, fontSize: 11}}>
              Conversation pane
            </Text>
            <View style={{flexDirection: 'row', gap: 8, marginTop: 8}}>
              <PaneButton label="-" onPress={() => setChatListWidth(w => Math.max(240, w - 40))} />
              <PaneButton label="+" onPress={() => setChatListWidth(w => Math.min(520, w + 40))} />
            </View>
          </View>
        ) : null}
        {railExpanded ? <View style={{padding: 12, opacity: 0.7}}>
          <Text style={{fontFamily: theme.fontFamilyMono, fontSize: 11, color: theme.colors.textMuted}}>
            Noise_XX_25519
          </Text>
          <Text style={{fontFamily: theme.fontFamilyMono, fontSize: 11, color: theme.colors.textMuted}}>
            AES-256-GCM
          </Text>
        </View> : null}
      </MicaBackground>

      <MicaBackground variant="mica" style={styles.body}>
        <RouteContent route={route} chatListWidth={chatListWidth} />
      </MicaBackground>
    </View>
  );
}

function RailItem({
  spec,
  active,
  compact,
  onPress,
}: {
  spec: typeof ROUTES[number];
  active: boolean;
  compact: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);
  const elevated = hovered || active;
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({pressed}) => [
        styles.railItem,
        compact && styles.railItemCompact,
        {
          backgroundColor: active
            ? theme.colors.accentSoft
            : elevated
              ? theme.fluent.bgFillTertiary
              : 'transparent',
          transform: [{translateY: elevated ? -1 : 0}],
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <View
        style={{
          width: 3,
          height: 16,
          borderRadius: 2,
          backgroundColor: active ? theme.colors.accent : 'transparent',
          marginRight: compact ? 0 : 10,
        }}
      />
      {compact ? null : <Text
        style={{
          fontFamily: theme.fontFamily,
          color: active ? theme.colors.text : theme.colors.textMuted,
          fontWeight: active ? '600' : '500',
          fontSize: 14,
        }}>
        {spec.label}
      </Text>}
    </Pressable>
  );
}

function PaneButton({label, onPress}: {label: string; onPress: () => void}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({pressed}) => [
        styles.paneButton,
        {borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.8 : 1},
      ]}>
      <Text style={{color: theme.colors.text, fontFamily: theme.fontFamilyMono}}>{label}</Text>
    </Pressable>
  );
}

function RouteContent({route, chatListWidth}: {route: RouteId; chatListWidth: number}) {
  switch (route) {
    case 'chats':
      return <ChatsRoute layout="windows" listWidth={chatListWidth} />;
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
  root: {flex: 1, flexDirection: 'row'},
  rail: {
    borderRightWidth: 1,
  },
  collapseButton: {
    alignSelf: 'flex-end',
    marginTop: 14,
    marginRight: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 6,
  },
  railItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 6,
  },
  railItemCompact: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  paneControls: {
    margin: 12,
    padding: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  paneButton: {
    minWidth: 34,
    alignItems: 'center',
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 6,
  },
  body: {flex: 1},
});
