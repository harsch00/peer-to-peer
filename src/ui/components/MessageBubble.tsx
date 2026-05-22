/**
 * Message bubble — Fluent (Windows) and M3 "Expressive" (Android) styled.
 * Windows bubbles use frosted acrylic glass backgrounds for Fluent Design depth.
 */
import React, {useCallback, useMemo, useState} from 'react';
import {Alert, Image, Platform, Pressable, StyleSheet, Text, View, Modal, Share} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';
import {useTheme} from '../theme/ThemeProvider';
import {PathTraceChip} from './PathTraceChip';
import type {ChatMessage} from '../../core/mesh/meshNode';
import {normalizeLocalFileUri} from '../../utils/fileUri';
import {useFileTransferStore} from '../../state/fileTransferStore';

interface Props {
  message: ChatMessage;
  isMe: boolean;
  onReact?: (messageId: string, emoji: string) => void;
  onPollVote?: (pollId: string, optionId: string) => void;
  onDelete?: (messageId: string) => void;
  myPeerId?: string;
  /** Windows: sent bubbles use accent fill — poll choices need a contrasting selected state. */
  pollOnAccentBubble?: boolean;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageBubble({
  message,
  isMe,
  onReact,
  onPollVote,
  onDelete,
  myPeerId,
  pollOnAccentBubble,
}: Props) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  const pulseBubble = useCallback(() => {
    scale.value = withSpring(1.04, {damping: 10, stiffness: 240, mass: 0.8});
    setTimeout(() => {
      scale.value = withSpring(1, {damping: 12, stiffness: 220});
    }, 140);
  }, [scale]);

  const openMessageActions = useCallback(() => {
    if (!onDelete) {
      return;
    }
    pulseBubble();
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Haptics = require('react-native-haptic-feedback').default;
        Haptics.trigger('impactMedium', {ignoreAndroidSystemSettings: false});
      } catch {
        // optional dependency
      }
    }
    Alert.alert(
      'Remove message?',
      'This removes the message from this device only.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Remove', style: 'destructive', onPress: () => onDelete(message.id)},
      ],
    );
  }, [message.id, onDelete, pulseBubble]);

  const bubbleColor = isMe
    ? theme.platform === 'windows'
      ? theme.fluent.acrylicBubbleSent
      : theme.colors.accent
    : theme.platform === 'windows'
      ? theme.fluent.acrylicBubbleReceived
      : theme.colors.surfaceAlt;
  const textColor = isMe ? (theme.platform === 'windows' ? '#fff' : theme.m3.onPrimary) : theme.colors.text;
  const mutedOnBubble = isMe ? 'rgba(255,255,255,0.75)' : theme.colors.textMuted;

  const radii =
    theme.platform === 'android'
      ? {borderRadius: 28, [isMe ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 8}
      : {borderRadius: 14, [isMe ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 4};

  const reactionSummary = useMemo(() => {
    const list = message.reactions ?? [];
    const map = new Map<string, number>();
    for (const r of list) {
      map.set(r.emoji, (map.get(r.emoji) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [message.reactions]);

  type WinMouseEvt = {nativeEvent?: {button?: number; buttons?: number}; preventDefault?: () => void};
  const winBubbleWrapper =
    Platform.OS === 'windows' && onDelete
      ? {
          onMouseDown: (e: WinMouseEvt) => {
            const btn = e.nativeEvent?.button;
            const buttons = e.nativeEvent?.buttons;
            if (btn === 2 || buttons === 2) {
              try {
                e.preventDefault?.();
              } catch {
                /* ignore */
              }
              openMessageActions();
            }
          },
        }
      : {};

  return (
    <Animated.View style={[{alignItems: isMe ? 'flex-end' : 'flex-start', marginVertical: 4}, animatedStyle]}>
      <View {...(winBubbleWrapper as object)} style={{maxWidth: 480, alignSelf: isMe ? 'flex-end' : 'flex-start'}}>
        <Pressable onLongPress={onDelete ? openMessageActions : undefined} delayLongPress={380}>
          <View style={[
            styles.bubble,
            radii,
            {
              backgroundColor: bubbleColor,
              ...(theme.platform === 'windows' ? {
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: isMe ? 'rgba(255,255,255,0.18)' : theme.colors.border,
              } : {}),
            },
          ]}>
            {Platform.OS === 'windows' && onDelete ? (
              <Pressable
                onPress={openMessageActions}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                style={(state: {pressed?: boolean; hovered?: boolean}) => [
                  styles.winMsgOverflow,
                  {
                    opacity: state.pressed ? 0.75 : 1,
                    backgroundColor: state.hovered ? 'rgba(0,0,0,0.08)' : 'transparent',
                  },
                ]}
                accessibilityLabel="Message options">
                <Text style={{color: textColor, fontSize: 18, lineHeight: 20, fontWeight: '700'}}>⋯</Text>
              </Pressable>
            ) : null}
            <MessageContent
              message={message}
              color={textColor}
              mutedColor={mutedOnBubble}
              onPollVote={onPollVote}
              myPeerId={myPeerId}
              pollOnAccentBubble={isMe && theme.platform === 'windows'}
            />
            {reactionSummary.length > 0 ? (
              <View style={[styles.reactionStrip, {justifyContent: isMe ? 'flex-end' : 'flex-start'}]}>
                {reactionSummary.map(([emoji, count]) => (
                  <View
                    key={emoji}
                    style={[
                      styles.reactionChip,
                      {
                        backgroundColor: isMe ? 'rgba(255,255,255,0.22)' : theme.colors.surface,
                        borderColor: theme.colors.border,
                      },
                    ]}>
                    <Text style={{fontSize: 13}}>{emoji}</Text>
                    {count > 1 ? (
                      <Text style={{fontSize: 11, color: textColor, fontFamily: theme.fontFamilyMono}}>{count}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>
      <View style={[styles.quickReact, {justifyContent: isMe ? 'flex-end' : 'flex-start'}]}>
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

function MessageContent({
  message,
  color,
  mutedColor,
  onPollVote,
  myPeerId,
  pollOnAccentBubble,
}: {
  message: ChatMessage;
  color: string;
  mutedColor: string;
  onPollVote?: (pollId: string, optionId: string) => void;
  myPeerId?: string;
  pollOnAccentBubble?: boolean;
}) {
  const theme = useTheme();
  const [viewerOpen, setViewerOpen] = useState(false);
  const base = {
    color,
    fontFamily: theme.fontFamily,
    fontSize: 14,
    lineHeight: 20,
  };
  const payload = message.payload;
  if (payload.kind === 'file_transfer_header') {
    return (
      <FileTransferProgress
        transferId={payload.transferId}
        fileName={payload.fileName}
        fileSize={payload.fileSize}
        attachmentType={payload.attachmentType}
        color={color}
        mutedColor={mutedColor}
      />
    );
  }
  if (payload.kind === 'poll') {
    const votes = message.pollVotes ?? {};
    const counts: Record<string, number> = {};
    for (const oid of Object.values(votes)) {
      counts[oid] = (counts[oid] ?? 0) + 1;
    }
    const myVote = myPeerId ? votes[myPeerId] : undefined;
    return (
      <View style={{gap: 8}}>
        <Text style={[base, {fontWeight: '700'}]}>{payload.question}</Text>
        <Text style={[base, {fontSize: 12, color: mutedColor}]}>Tap an option to vote</Text>
        {payload.options.map(option => {
          const count = counts[option.id] ?? 0;
          const selected = myVote === option.id;
          const winContrast = !!(selected && pollOnAccentBubble);
          const optTextColor =
            theme.platform === 'windows' && selected && !pollOnAccentBubble
              ? theme.scheme === 'dark'
                ? '#111111'
                : '#ffffff'
              : winContrast
                ? theme.colors.accent
                : color;
          return (
            <Pressable
              key={option.id}
              onPress={() => onPollVote?.(payload.pollId, option.id)}
              style={(state: {pressed?: boolean; hovered?: boolean}) => {
                const hovered = !!state.hovered;
                const pressed = !!state.pressed;
                return {
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                  backgroundColor: winContrast
                    ? '#ffffff'
                    : selected
                      ? theme.platform === 'android'
                        ? theme.m3.primaryContainer
                        : theme.platform === 'windows'
                          ? theme.colors.accent
                          : `${theme.colors.accent}22`
                      : hovered
                        ? theme.colors.surfaceAlt
                        : 'transparent',
                  opacity: pressed ? 0.85 : 1,
                  minHeight: 44,
                  ...(Platform.OS === 'windows' ? {cursor: onPollVote ? ('pointer' as never) : undefined} : {}),
                };
              }}
              disabled={!onPollVote}>
              <Text
                style={[
                  base,
                  {
                    flex: 1,
                    marginRight: 8,
                    color: optTextColor,
                    fontWeight: selected ? '600' : '400',
                  },
                ]}>
                {option.text}
              </Text>
              {count > 0 ? (
                <View
                  style={{
                    minWidth: 26,
                    alignItems: 'center',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: winContrast
                      ? 'rgba(0,0,0,0.08)'
                      : selected && theme.platform === 'windows'
                        ? theme.scheme === 'dark'
                          ? 'rgba(0,0,0,0.12)'
                          : 'rgba(255,255,255,0.25)'
                        : theme.colors.surfaceAlt,
                  }}>
                  <Text
                    style={{
                      fontFamily: theme.fontFamilyMono,
                      fontSize: 13,
                      color: optTextColor,
                      fontWeight: '600',
                    }}>
                    {count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    );
  }
  if (payload.kind === 'attachment') {
    const inlineDataUri =
      payload.dataBase64 && payload.mimeType
        ? `data:${payload.mimeType};base64,${payload.dataBase64}`
        : payload.dataBase64
          ? `data:application/octet-stream;base64,${payload.dataBase64}`
          : '';
    const resolvedUri = inlineDataUri || (payload.uri ? normalizeLocalFileUri(payload.uri) : '');
    const showImage = payload.attachmentType === 'image' && !!resolvedUri;
    const isDoc = (payload.attachmentType === 'document' || payload.attachmentType === 'video') && !!resolvedUri;

    return (
      <View>
        {showImage ? (
          <>
            <Pressable onPress={() => setViewerOpen(true)}>
              <Image
                source={{uri: resolvedUri}}
                style={{width: 220, height: 160, borderRadius: 8, marginBottom: 6, backgroundColor: theme.colors.surface}}
                resizeMode="cover"
              />
            </Pressable>
            <Modal
              visible={viewerOpen}
              transparent={true}
              onRequestClose={() => setViewerOpen(false)}
              onShow={() => {}}
              onDismiss={() => {}}>
              <View style={styles.viewerBackdrop}>
                <Pressable style={styles.viewerClose} onPress={() => setViewerOpen(false)}>
                  <Text style={styles.viewerCloseText}>✕ Close</Text>
                </Pressable>
                <Image source={{uri: resolvedUri}} style={styles.viewerImage} resizeMode="contain" />
              </View>
            </Modal>
          </>
        ) : null}
        <Text style={[base, {fontWeight: '700'}]}>
          {payload.attachmentType.toUpperCase()} · {payload.name}
        </Text>
        {!showImage ? (
          <Text style={base}>
            {payload.mimeType ?? 'file'}{payload.sizeBytes ? ` · ${humanSize(payload.sizeBytes)}` : ''}
          </Text>
        ) : null}
        {isDoc ? (
          <Pressable
            style={[styles.saveBtn, {backgroundColor: theme.colors.surfaceAlt}]}
            onPress={() => Share.share({url: resolvedUri, message: payload.name}).catch(() => {})}>
            <Text style={{color: theme.colors.text, fontSize: 13, fontWeight: '500'}}>Save / Share</Text>
          </Pressable>
        ) : null}
        {!showImage && payload.dataBase64 && !isDoc ? (
          <Text style={[base, {fontSize: 12, color: mutedColor}]}>Inline file data received</Text>
        ) : null}
      </View>
    );
  }
  return <Text style={base}>{message.body}</Text>;
}

function FileTransferProgress({
  transferId,
  fileName,
  fileSize,
  attachmentType,
  color,
  mutedColor,
}: {
  transferId: string;
  fileName: string;
  fileSize: number;
  attachmentType: string;
  color: string;
  mutedColor: string;
}) {
  const theme = useTheme();
  const transfer = useFileTransferStore(s => s.transfers[transferId]);
  const progress = transfer?.progress ?? 0;
  const status = transfer?.status ?? 'in_progress';
  const sizeLabel =
    fileSize < 1024
      ? `${fileSize} B`
      : fileSize < 1024 * 1024
        ? `${(fileSize / 1024).toFixed(1)} KB`
        : `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <View style={{gap: 6, minWidth: 180}}>
      <Text
        style={{
          color,
          fontFamily: theme.fontFamily,
          fontSize: 14,
          fontWeight: '700',
        }}>
        {attachmentType.toUpperCase()} · {fileName}
      </Text>
      <View
        style={[
          styles.ftProgressTrack,
          {backgroundColor: theme.colors.surfaceAlt},
        ]}>
        <View
          style={[
            styles.ftProgressFill,
            {
              backgroundColor:
                status === 'failed'
                  ? theme.colors.danger
                  : status === 'completed'
                    ? theme.colors.success
                    : theme.colors.accent,
              width: `${Math.round(progress * 100)}%` as any,
            },
          ]}
        />
      </View>
      <Text
        style={{
          color: mutedColor,
          fontFamily: theme.fontFamilyMono,
          fontSize: 11,
        }}>
        {status === 'completed'
          ? `✓ ${transfer?.direction === 'outbound' ? 'Sent' : 'Received'} · ${sizeLabel}`
          : status === 'failed'
            ? `✕ Transfer failed`
            : `${transfer?.direction === 'outbound' ? 'Sending' : 'Receiving'}… ${Math.round(progress * 100)}% · ${sizeLabel}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'relative',
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: 480,
  },
  winMsgOverflow: {
    position: 'absolute',
    right: 4,
    top: 2,
    zIndex: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  reactionStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metaRow: {marginTop: 2, gap: 2},
  quickReact: {
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
  ftProgressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  ftProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 40,
    right: 24,
    padding: 12,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
  },
  viewerCloseText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  saveBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
});
