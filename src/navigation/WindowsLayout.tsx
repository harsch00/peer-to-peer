/**
 * Windows 11 three-pane shell: acrylic nav rail, mica body, draggable splits.
 */
import React, {useCallback, useRef} from 'react';
import {Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {MicaBackground} from '../ui/components/MicaBackground';
import {useTheme} from '../ui/theme/ThemeProvider';
import {ROUTES, RouteId} from './routes';
import {ChatsRoute} from '../ui/screens/ChatsRoute';
import {RadarScreen} from '../ui/screens/RadarScreen';
import {DiagnosticsScreen} from '../ui/screens/DiagnosticsScreen';
import {ProfileScreen} from '../ui/screens/ProfileScreen';
import {SettingsScreen} from '../ui/screens/SettingsScreen';
import {useMessagesStore} from '../state/messagesStore';
import {useUiChromeStore} from '../state/uiChromeStore';

const RAIL_MIN = 64;
const RAIL_MAX = 304;
const LIST_MIN = 200;
const LIST_MAX = 640;

export function WindowsLayout() {
  const theme = useTheme();
  const [route, setRoute] = React.useState<RouteId>('chats');
  const chatsUnread = useMessagesStore(s => s.chatsUnread);

  React.useEffect(() => {
    useUiChromeStore.getState().setActiveRoute('chats');
  }, []);

  const navigate = React.useCallback((r: RouteId) => {
    useUiChromeStore.getState().setActiveRoute(r);
    if (r === 'chats') {
      useMessagesStore.getState().clearChatsUnread();
    }
    setRoute(r);
  }, []);
  const [chatListWidth, setChatListWidth] = React.useState(308);
  const [railCompact, setRailCompact] = React.useState(false);
  const railW = useSharedValue(240);
  const savedExpandedRail = useRef(240);

  const railAnim = useAnimatedStyle(() => ({
    width: railW.value,
    overflow: 'hidden',
  }));

  const railDragOrigin = useSharedValue(240);

  const toggleRail = useCallback(() => {
    const timing = {
      duration: 280,
      easing: Easing.bezier(0.05, 0.7, 0.1, 1),
    };
    if (railW.value <= RAIL_MIN + 8) {
      const target = Math.min(RAIL_MAX, Math.max(180, savedExpandedRail.current));
      railW.value = withTiming(target, timing);
      setRailCompact(false);
    } else {
      savedExpandedRail.current = railW.value;
      railW.value = withTiming(RAIL_MIN, timing);
      setRailCompact(true);
    }
  }, [railW]);

  const railPan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .onStart(() => {
      railDragOrigin.value = railW.value;
    })
    .onUpdate(e => {
      railW.value = Math.min(
        RAIL_MAX,
        Math.max(RAIL_MIN, railDragOrigin.value + e.translationX),
      );
    })
    .onEnd(() => {
      runOnJS(setRailCompact)(railW.value <= RAIL_MIN + 8);
    });

  return (
    <View style={[styles.root, {backgroundColor: 'transparent'}]}>
      <Animated.View style={[railAnim]}>
        <MicaBackground variant="acrylic" style={{...styles.rail, borderRightColor: theme.colors.border}}>
          <View style={styles.railTopRow}>
            <Pressable
              onPress={toggleRail}
              style={({pressed}) => [
                styles.collapseButton,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.fluent.bgFillTertiary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <Text style={{color: theme.colors.text, fontFamily: 'Segoe MDL2 Assets', fontSize: 11}}>
                {railCompact ? '\uE76C' : '\uE76B'}
              </Text>
            </Pressable>
          </View>
          <Text
            style={{
              fontFamily: theme.fontFamily,
              color: theme.colors.text,
              fontSize: 17,
              fontWeight: '600',
              paddingHorizontal: 16,
              paddingTop: 4,
              paddingBottom: 10,
              letterSpacing: 0.2,
            }}
            numberOfLines={1}>
            P2P · Mesh
          </Text>
          {ROUTES.map(r => (
            <RailItem
              key={r.id}
              spec={r}
              active={route === r.id}
              railW={railW}
              badgeCount={r.id === 'chats' ? chatsUnread : 0}
              onPress={() => navigate(r.id)}
            />
          ))}
          <View style={{flex: 1}} />
          {route === 'chats' ? (
            <View style={{paddingHorizontal: 14, paddingBottom: 10}}>
              <Text
                style={{fontFamily: theme.fontFamilyMono, fontSize: 10, color: theme.colors.textMuted}}>
                Drag pane edges to resize
              </Text>
            </View>
          ) : null}
          <View style={{padding: 12, opacity: 0.72}}>
            <Text style={{fontFamily: theme.fontFamilyMono, fontSize: 11, color: theme.colors.textMuted}}>
              Noise_XX_25519
            </Text>
            <Text style={{fontFamily: theme.fontFamilyMono, fontSize: 11, color: theme.colors.textMuted}}>
              AES-256-GCM
            </Text>
          </View>
        </MicaBackground>
      </Animated.View>

      <GestureDetector gesture={railPan}>
        <View
          style={[
            styles.resizeStrip,
            {backgroundColor: theme.colors.border},
            Platform.OS === 'windows' && ({cursor: 'ew-resize' as never}),
          ]}
        />
      </GestureDetector>

      <MicaBackground variant="mica" style={styles.body}>
        <RouteContent route={route} chatListWidth={chatListWidth} onChatListWidth={setChatListWidth} />
      </MicaBackground>
    </View>
  );
}

const AnimatedText = Animated.createAnimatedComponent(Text);

function RailItem({
  spec,
  active,
  railW,
  badgeCount = 0,
  onPress,
}: {
  spec: (typeof ROUTES)[number];
  active: boolean;
  railW: SharedValue<number>;
  badgeCount?: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const [hovered, setHovered] = React.useState(false);

  const labelStyle = useAnimatedStyle(() => {
    const compact = railW.value < RAIL_MIN + 36;
    return {
      opacity: compact ? 0 : 1,
      maxWidth: compact ? 0 : 200,
      marginLeft: compact ? 0 : 8,
    };
  });

  const elevated = hovered || active;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({pressed}) => [
        styles.railItem,
        {
          backgroundColor: active
            ? theme.colors.accentSoft
            : elevated
              ? theme.fluent.bgFillTertiary
              : 'transparent',
          opacity: pressed ? 0.88 : 1,
        },
      ]}>
      <View
        style={{
          width: 3,
          height: 18,
          borderRadius: 2,
          backgroundColor: active ? theme.colors.accent : 'transparent',
        }}
      />
      <View style={{position: 'relative', width: 22, alignItems: 'center'}}>
        <Text
          style={{
            fontFamily: 'Segoe MDL2 Assets',
            fontSize: 17,
            width: 22,
            textAlign: 'center',
            color: active ? theme.colors.accent : theme.colors.textMuted,
          }}>
          {spec.mdl2}
        </Text>
        {badgeCount > 0 ? (
          <View
            style={{
              position: 'absolute',
              right: -10,
              top: -4,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              paddingHorizontal: 4,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.accent,
            }}>
            <Text style={{color: '#fff', fontSize: 9, fontWeight: '700', fontFamily: theme.fontFamilyMono}}>
              {badgeCount > 99 ? '99+' : badgeCount}
            </Text>
          </View>
        ) : null}
      </View>
      <AnimatedText
        numberOfLines={1}
        style={[
          labelStyle,
          {
            fontFamily: theme.fontFamily,
            color: active ? theme.colors.text : theme.colors.textMuted,
            fontWeight: active ? '600' : '500',
            fontSize: 14,
            flexShrink: 1,
          },
        ]}>
        {spec.label}
      </AnimatedText>
    </Pressable>
  );
}

function RouteContent({
  route,
  chatListWidth,
  onChatListWidth,
}: {
  route: RouteId;
  chatListWidth: number;
  onChatListWidth: (w: number) => void;
}) {
  switch (route) {
    case 'chats':
      return (
        <ChatsRoute
          layout="windows"
          listWidth={chatListWidth}
          onResizeListWidth={onChatListWidth}
        />
      );
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
    flex: 1,
    borderRightWidth: 0,
  },
  railTopRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 12,
    paddingRight: 8,
  },
  collapseButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 6,
  },
  railItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  resizeStrip: {
    width: 4,
    alignSelf: 'stretch',
    opacity: 0.55,
  },
  body: {flex: 1},
});
