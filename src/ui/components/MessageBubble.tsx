/**
 * Message bubble — Fluent (Windows) and M3 "Expressive" (Android) styled.
 *
 *  • Outgoing messages float right with the platform accent.
 *  • Incoming messages float left on a surface container shade.
 *  • Long-press on Android triggers a haptic tick.
 *  • Each bubble shows a hop/latency badge and a tappable route chip.
 */
import React, {useCallback} from 'react';
import {Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';
import {useTheme} from '../theme/ThemeProvider';
import {PathTraceChip} from './PathTraceChip';
import type {ChatMessage} from '../../core/mesh/meshNode';

interface Props {
  message: ChatMessage;
  isMe: boolean;
  onReact?: (messageId: string, emoji: string) => void;
}

export function MessageBubble({message, isMe, onReact}: Props) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  const onLongPress = useCallback(() => {
    scale.value = withSpring(1.04, {damping: 10, stiffness: 240, mass: 0.8});
    setTimeout(() => {
      scale.value = withSpring(1, {damping: 12, stiffness: 220});
    }, 140);
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Haptics = require('react-native-haptic-feedback').default;
        Haptics.trigger('impactMedium', {ignoreAndroidSystemSettings: false});
      } catch {
        // module not installed in this build → silent
      }
    }
  }, [scale]);

  const bubbleColor = isMe ? theme.colors.accent : theme.colors.surfaceAlt;
  const textColor = isMe ? (theme.platform === 'windows' ? '#fff' : theme.m3.onPrimary) : theme.colors.text;

  const radii = theme.platform === 'android'
    ? {borderRadius: 28, [isMe ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 8}
    : {borderRadius: 14, [isMe ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 4};

  return (
    <Animated.View style={[{alignItems: isMe ? 'flex-end' : 'flex-start', marginVertical: 4}, animatedStyle]}>
      <Pressable onLongPress={onLongPress} delayLongPress={350}>
        <View style={[styles.bubble, radii, {backgroundColor: bubbleColor}]}>
          <MessageContent message={message} color={textColor} />
        </View>
      </Pressable>
      <View style={[styles.reactions, {justifyContent: isMe ? 'flex-end' : 'flex-start'}]}>
        {['👍', '❤️', '😂'].map(emoji => (
          <Pressable
            key={emoji}
            onPress={() => onReact?.(message.id, emoji)}
            style={[styles.reactionBtn, {backgroundColor: theme.colors.surfaceAlt}]}>
            <Text>{emoji}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.metaRow, {alignItems: isMe ? 'flex-end' : 'flex-start'}]}>
        <View style={styles.metaLine}>
          <Text style={[styles.timestamp, {color: theme.colors.textMuted, fontFamily: theme.fontFamilyMono}]}>
            {new Date(message.receivedAtMs).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
          </Text>
          <View style={[styles.badge, {backgroundColor: theme.colors.surfaceAlt}]}>
            <Text style={{color: theme.colors.textMuted, fontSize: 10, fontFamily: theme.fontFamilyMono}}>
              {message.hopCount}h · {message.latencyMs}ms
            </Text>
          </View>
        </View>

        <PathTraceChip path={message.path} hopCount={message.hopCount} latencyMs={message.latencyMs} />
      </View>
    </Animated.View>
  );
}

function MessageContent({message, color}: {message: ChatMessage; color: string}) {
  const theme = useTheme();
  const base = {
    color,
    fontFamily: theme.fontFamily,
    fontSize: 14,
    lineHeight: 20,
  };
  const payload = message.payload;
  if (payload.kind === 'poll') {
    return (
      <View>
        <Text style={[base, {fontWeight: '700'}]}>{payload.question}</Text>
        {payload.options.map(option => (
          <Text key={option.id} style={base}>
            {option.id}. {option.text}
          </Text>
        ))}
      </View>
    );
  }
  if (payload.kind === 'attachment') {
    return (
      <View>
        <Text style={[base, {fontWeight: '700'}]}>
          {payload.attachmentType.toUpperCase()} · {payload.name}
        </Text>
        <Text style={base}>
          {payload.mimeType ?? 'metadata only'}{payload.sizeBytes ? ` · ${payload.sizeBytes} bytes` : ''}
        </Text>
      </View>
    );
  }
  return <Text style={base}>{message.body}</Text>;
}

const styles = StyleSheet.create({
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: 480,
  },
  metaRow: {marginTop: 2, gap: 2},
  reactions: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  reactionBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  metaLine: {flexDirection: 'row', alignItems: 'center', gap: 6},
  timestamp: {fontSize: 10},
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
});
