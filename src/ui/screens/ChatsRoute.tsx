/**
 * The "Chats" route.
 *
 *  • windows  → conversation list (middle pane) + active chat (right pane).
 *  • android  → single column with drill-in transition into the chat view.
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {runOnJS, SlideInRight, useSharedValue, useAnimatedStyle, type SharedValue} from 'react-native-reanimated';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {useTheme} from '../theme/ThemeProvider';
import {usePeersStore} from '../../state/peersStore';
import {useMessagesStore, BROADCAST_KEY} from '../../state/messagesStore';
import {usePeerDirectoryStore, getPeerAvatarStyle, getPeerLabel} from '../../state/peerDirectoryStore';
import {useUiChromeStore} from '../../state/uiChromeStore';
import {PeerAvatar} from '../components/PeerAvatar';
import {SignalBar} from '../components/SignalBar';
import {MessageBubble} from '../components/MessageBubble';
import {ChatComposer} from '../components/ChatComposer';
import {PollBuilderOverlay} from '../components/PollBuilderOverlay';
import {maybeMesh} from '../../core/mesh/meshSingleton';
import type {PeerLink} from '../../core/transport/types';
import type {ChatPayload} from '../../core/protocol/messageEnvelope';
import {ZERO_PEER} from '../../core/protocol/packet';

type ConversationKey = string; // peerId or BROADCAST_KEY

interface Conversation {
  key: ConversationKey;
  title: string;
  subtitle: string;
  link?: PeerLink;
}

const WIN_LIST_MIN = 200;
const WIN_LIST_MAX = 640;

export function ChatsRoute({
  layout,
  listWidth = 320,
  onResizeListWidth,
}: {
  layout: 'windows' | 'android';
  listWidth?: number;
  onResizeListWidth?: (width: number) => void;
}) {
  const theme = useTheme();
  const peers = usePeersStore(s => s.peers);
  const peerProfiles = usePeerDirectoryStore(s => s.byPeer);
  const setActiveChatKey = useUiChromeStore(s => s.setActiveChatKey);
  const setAndroidChatLayer = useUiChromeStore(s => s.setAndroidChatLayer);
  const unreadByPeer = useMessagesStore(s => s.unreadByPeer);
  const clearConversationUnread = useMessagesStore(s => s.clearConversationUnread);

  const conversations = useMemo<Conversation[]>(() => {
    const out: Conversation[] = [
      {
        key: BROADCAST_KEY,
        title: '#mesh-broadcast',
        subtitle: 'Anyone in the local mesh can read this channel',
      },
    ];
    for (const link of peers) {
      const peerId = link.peerId ?? link.linkId;
      out.push({
        key: peerId,
        title: getPeerLabel(peerId),
        subtitle: `${link.transport} · ${link.rssi.toFixed(0)} dBm`,
        link,
      });
    }
    return out;
  }, [peers, peerProfiles]);

  const [active, setActive] = useState<ConversationKey>(BROADCAST_KEY);
  const [androidInChat, setAndroidInChat] = useState(false);

  useEffect(() => {
    setActiveChatKey(active);
    clearConversationUnread(active);
  }, [active, setActiveChatKey, clearConversationUnread]);

  useEffect(() => {
    if (layout === 'android') {
      setAndroidChatLayer(androidInChat ? 'thread' : 'list');
    } else {
      setAndroidChatLayer('thread');
    }
  }, [layout, androidInChat, setAndroidChatLayer]);

  useEffect(() => {
    if (layout !== 'android' || !androidInChat) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setAndroidInChat(false);
      return true;
    });
    return () => sub.remove();
  }, [layout, androidInChat]);

  const openAndroidConversation = (k: ConversationKey) => {
    setActive(k);
    setAndroidInChat(true);
  };

  const clearMessages = useMessagesStore(s => s.clear);
  const confirmAndClearConversation = (key: ConversationKey) => {
    Alert.alert(
      'Clear chat history?',
      'Messages will be removed on this device only. Other peers still have their copies.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => clearMessages(key),
        },
      ],
    );
  };

  const handleResizeEnd = (w: number) => {
    if (onResizeListWidth) {
      onResizeListWidth(w);
    }
  };

  const listW = useSharedValue(listWidth ?? 320);
  useEffect(() => {
    if (listWidth !== undefined) listW.value = listWidth;
  }, [listWidth, listW]);

  const listAnimStyle = useAnimatedStyle(() => ({
    width: listW.value,
  }));

  if (layout === 'windows') {
    return (
      <View style={styles.row}>
        <Animated.View style={[styles.list, {borderRightColor: theme.colors.border, borderRightWidth: 1}, listAnimStyle]}>
          <ConversationList
            conversations={conversations}
            activeKey={active}
            unreadByPeer={unreadByPeer}
            onSelect={setActive}
            onRequestClearConversation={confirmAndClearConversation}
          />
        </Animated.View>
        {onResizeListWidth ? (
          <PaneResizeHandle
            listW={listW}
            onResizeEnd={handleResizeEnd}
          />
        ) : null}
        <View style={styles.activePane}>
          <ActiveChat
            conversationKey={active}
            conversations={conversations}
            onRequestClearConversation={confirmAndClearConversation}
          />
        </View>
      </View>
    );
  }
  // Android: conversation list first, full-screen chat with back (like typical chat apps).
  return (
    <View style={{flex: 1}}>
      {!androidInChat ? (
        <ConversationList
          conversations={conversations}
          activeKey={active}
          unreadByPeer={unreadByPeer}
          onSelect={openAndroidConversation}
          onRequestClearConversation={confirmAndClearConversation}
        />
      ) : (
        <ActiveChat
          conversationKey={active}
          conversations={conversations}
          onBack={() => setAndroidInChat(false)}
          onRequestClearConversation={confirmAndClearConversation}
        />
      )}
    </View>
  );
}

function PaneResizeHandle({
  listW,
  onResizeEnd,
}: {
  listW: SharedValue<number>;
  onResizeEnd: (w: number) => void;
}) {
  const theme = useTheme();
  const origin = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onStart(() => {
      origin.value = listW.value;
    })
    .onUpdate(e => {
      const next = Math.min(
        WIN_LIST_MAX,
        Math.max(WIN_LIST_MIN, origin.value + e.translationX),
      );
      listW.value = next;
    })
    .onEnd(() => {
      runOnJS(onResizeEnd)(Math.round(listW.value));
    });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        collapsable={false}
        style={[
          styles.resizeCol,
          {
            ...(Platform.OS === 'windows' ? {cursor: 'ew-resize' as never} : {}),
          },
        ]}>
        <View
          style={{
            width: 1,
            height: '100%',
            backgroundColor: theme.colors.border,
            opacity: 0.55,
          }}
        />
      </Animated.View>
    </GestureDetector>
  );
}

function ConversationList({
  conversations,
  activeKey,
  unreadByPeer,
  onSelect,
  onRequestClearConversation,
}: {
  conversations: Conversation[];
  activeKey: ConversationKey;
  unreadByPeer: Record<string, number>;
  onSelect: (k: ConversationKey) => void;
  onRequestClearConversation: (k: ConversationKey) => void;
}) {
  const theme = useTheme();
  const discoveredCount = conversations.filter(c => c.key !== BROADCAST_KEY).length;
  return (
    <ScrollView contentContainerStyle={{paddingVertical: 8}}>
      <Text
        style={{
          fontFamily: theme.fontFamily,
          fontSize: theme.platform === 'windows' ? 24 : 22,
          fontWeight: '700',
          color: theme.colors.text,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
        }}>
        Conversations
      </Text>
      {conversations.map(c => (
        <View key={c.key} style={[styles.convoRowOuter, {marginHorizontal: 6, position: 'relative'}]}>
          {activeKey === c.key && (
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 10,
                bottom: 10,
                width: 3,
                borderRadius: 1.5,
                backgroundColor: theme.colors.accent,
                zIndex: 10,
              }}
            />
          )}
          <Pressable
            onPress={() => onSelect(c.key)}
            style={(state: {pressed?: boolean; hovered?: boolean}) => {
              const hovered = !!state.hovered;
              const pressed = !!state.pressed;
              const isWin = theme.platform === 'windows';
              return [
                styles.convoRowMain,
                {
                  backgroundColor:
                    activeKey === c.key
                      ? theme.colors.accentSoft
                      : hovered
                        ? isWin ? theme.fluent.hoverReveal : theme.colors.surfaceAlt
                        : 'transparent',
                  transform: [{translateY: hovered ? -1 : 0}],
                  opacity: pressed ? 0.85 : 1,
                  ...(isWin && (activeKey === c.key || hovered) ? {
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.fluent.glassBorderSubtle,
                  } : {}),
                },
              ];
            }}>
            <PeerAvatar
              seed={c.key}
              size={42}
              style={c.key === BROADCAST_KEY ? 'pixel-art' : getPeerAvatarStyle(c.key, 'bottts')}
              online={c.link ? c.link.secured : true}
            />
            <View style={{flex: 1, marginLeft: 12}}>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.fontFamily,
                  fontSize: 15,
                  fontWeight: '600',
                }}>
                {c.title}
              </Text>
              <Text
                numberOfLines={1}
                style={{color: theme.colors.textMuted, fontFamily: theme.fontFamilyMono, fontSize: 11}}>
                {c.subtitle}
              </Text>
            </View>
            {(unreadByPeer[c.key] ?? 0) > 0 ? (
              <View
                style={{
                  marginRight: 8,
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  paddingHorizontal: 6,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.accent,
                }}>
                <Text style={{color: '#fff', fontFamily: theme.fontFamilyMono, fontSize: 11, fontWeight: '700'}}>
                  {(unreadByPeer[c.key] ?? 0) > 99 ? '99+' : unreadByPeer[c.key]}
                </Text>
              </View>
            ) : null}
            {c.link && (
              <SignalBar rssi={c.link.rssi} reliability={c.link.reliability} compact />
            )}
          </Pressable>
          <Pressable
            accessibilityLabel={`Clear history for ${c.title}`}
            onPress={() => {
              onRequestClearConversation(c.key);
            }}
            hitSlop={10}
            style={(state: {pressed?: boolean; hovered?: boolean}) => {
              const hovered = !!state.hovered;
              const pressed = !!state.pressed;
              return {
                paddingHorizontal: 10,
                paddingVertical: 10,
                justifyContent: 'center',
                borderRadius: 8,
                marginLeft: 4,
                backgroundColor: hovered ? theme.colors.surfaceAlt : 'transparent',
                opacity: pressed ? 0.75 : 1,
                ...(Platform.OS === 'windows' ? {cursor: 'pointer' as never} : {}),
              };
            }}>
            <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamily, fontSize: 12}}>
              Clear
            </Text>
          </Pressable>
        </View>
      ))}
      {discoveredCount === 0 ? (
        <View
          style={[
            styles.emptyState,
            {
              backgroundColor: theme.platform === 'windows' ? theme.fluent.acrylicCard : theme.colors.surface,
              borderColor: theme.platform === 'windows' ? theme.fluent.glassBorderSubtle : theme.colors.border,
            },
          ]}>
          <Text style={{color: theme.colors.text, fontFamily: theme.fontFamily, fontWeight: '700'}}>
            No real peers discovered
          </Text>
          <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamily, fontSize: 12, marginTop: 6}}>
            BLE, Wi-Fi Direct, and Nostr diagnostics are shown in the Diagnostics tab.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function ActiveChat({
  conversationKey,
  conversations,
  onBack,
  onRequestClearConversation,
}: {
  conversationKey: ConversationKey;
  conversations: Conversation[];
  /** Android full-screen mode: header back control + hardware Back handled by parent */
  onBack?: () => void;
  onRequestClearConversation: (key: ConversationKey) => void;
}) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const messages = useMessagesStore(s => s.byPeer[conversationKey] ?? []);
  const removeMessage = useMessagesStore(s => s.removeMessage);
  const visibleMessages = useMemo(
    () =>
      messages.filter(
        m =>
          m.payload.kind !== 'poll_vote' &&
          m.payload.kind !== 'peer_profile' &&
          m.payload.kind !== 'file_transfer_chunk' &&
          m.payload.kind !== 'file_transfer_complete',
      ),
    [messages],
  );

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({animated: true});
    });
    return () => cancelAnimationFrame(t);
  }, [visibleMessages.length, conversationKey]);
  const [pollOpen, setPollOpen] = useState(false);
  const me = usePeersStore(s => s.identity);
  const convo = conversations.find(c => c.key === conversationKey);

  const onSend = async (body: string) => {
    await onSendPayload({kind: 'text', text: body});
  };

  const onSendPayload = async (payload: ChatPayload) => {
    const mesh = maybeMesh();
    if (!mesh) return;
    if (conversationKey === BROADCAST_KEY) {
      await mesh.sendBroadcastPayload(payload);
    } else {
      try {
        await mesh.sendChatPayload(conversationKey, payload);
      } catch (e) {
        // Fallback to the broadcast channel until a Noise session exists.
        await mesh.sendBroadcastPayload(payload);
      }
    }
  };

  const onSendFile = async (
    fileBytes: Uint8Array,
    fileName: string,
    mimeType: string,
    attachmentType: 'image' | 'video' | 'document',
  ) => {
    const mesh = maybeMesh();
    if (!mesh) return;
    const toPeerId = conversationKey === BROADCAST_KEY ? ZERO_PEER : conversationKey;
    try {
      await mesh.sendFile(toPeerId, fileBytes, fileName, mimeType, attachmentType);
    } catch (e) {
      const {Alert} = require('react-native');
      Alert.alert('Transfer failed', e instanceof Error ? e.message : String(e));
    }
  };

  const onReact = (messageId: string, emoji: string) => {
    onSendPayload({kind: 'reaction', messageId, emoji});
  };

  const onPollVote = (pollId: string, optionId: string) => {
    void onSendPayload({kind: 'poll_vote', pollId, optionId});
  };

  const onDeleteMessage = (messageId: string) => {
    removeMessage(conversationKey, messageId);
  };

  return (
    <View style={{flex: 1, backgroundColor: theme.colors.bg}}>
      <View
        style={[
          styles.chatHeader,
          {
            borderBottomColor: theme.colors.border,
            ...(theme.platform === 'windows' ? {
              backgroundColor: theme.fluent.acrylicHeader,
              borderBottomColor: theme.fluent.glassBorderSubtle,
            } : {}),
          },
        ]}>
        {onBack ? (
          <Pressable
            accessibilityLabel="Back to conversations"
            onPress={onBack}
            hitSlop={12}
            style={({pressed}) => ({
              marginRight: 8,
              paddingVertical: 8,
              paddingRight: 4,
              opacity: pressed ? 0.6 : 1,
            })}>
            <Text style={{fontSize: 22, color: theme.colors.text, fontWeight: '600'}}>←</Text>
          </Pressable>
        ) : null}
        <PeerAvatar
          seed={conversationKey}
          size={36}
          style={
            conversationKey === BROADCAST_KEY ? 'pixel-art' : getPeerAvatarStyle(conversationKey, 'bottts')
          }
          online={true}
        />
        <View style={{marginLeft: 12, flex: 1}}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.fontFamily,
              fontSize: 16,
              fontWeight: '700',
            }}>
            {convo?.title ?? '—'}
          </Text>
          <Text style={{color: theme.colors.textMuted, fontSize: 12, fontFamily: theme.fontFamilyMono}}>
            {convo?.link ? `Noise XX · ${convo.link.transport}` : 'Mesh broadcast (un-encrypted)'}
          </Text>
        </View>
        {convo?.link && (
          <SignalBar rssi={convo.link.rssi} reliability={convo.link.reliability} />
        )}
        <Pressable
          accessibilityLabel="Clear this chat history"
          onPress={() => onRequestClearConversation(conversationKey)}
          hitSlop={8}
          style={(state: {pressed?: boolean; hovered?: boolean}) => {
            const hovered = !!state.hovered;
            const pressed = !!state.pressed;
            const isWin = theme.platform === 'windows';
            return {
              marginLeft: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: hovered
                ? isWin ? theme.fluent.hoverReveal : theme.colors.surfaceAlt
                : isWin ? theme.fluent.acrylicCard : theme.colors.accentSoft,
              opacity: pressed ? 0.8 : 1,
              ...(isWin ? {
                cursor: 'pointer' as never,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: hovered ? theme.fluent.glassBorderSubtle : 'transparent',
              } : {}),
            };
          }}>
          <Text style={{color: theme.colors.text, fontFamily: theme.fontFamily, fontSize: 13, fontWeight: '600'}}>
            Clear
          </Text>
        </Pressable>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{padding: 16, gap: 4}}>
        {visibleMessages.length === 0 ? (
          <View style={{alignItems: 'center', marginTop: 40, opacity: 0.7}}>
            <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamily}}>
              No messages yet — say hi to the mesh.
            </Text>
          </View>
        ) : (
          visibleMessages.map(m => (
            <Animated.View
              entering={SlideInRight.duration(200)}
              key={m.id}>
              <MessageBubble
                message={m}
                isMe={m.fromPeerId === me?.peerId}
                myPeerId={me?.peerId}
                pollOnAccentBubble={m.fromPeerId === me?.peerId && theme.platform === 'windows'}
                onReact={onReact}
                onPollVote={onPollVote}
                onDelete={onDeleteMessage}
              />
            </Animated.View>
          ))
        )}
      </ScrollView>

      <ChatComposer
        onSend={onSend}
        onSendPayload={onSendPayload}
        onSendFile={onSendFile}
        onOpenPoll={() => setPollOpen(true)}
      />
      <PollBuilderOverlay
        visible={pollOpen}
        onClose={() => setPollOpen(false)}
        onSubmit={onSendPayload}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flex: 1, flexDirection: 'row'},
  list: {},
  resizeCol: {
    width: 12,
    marginHorizontal: -6,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  activePane: {flex: 1},
  convoRowOuter: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 12,
    overflow: 'hidden',
  },
  convoRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 0,
  },
  emptyState: {
    marginHorizontal: 12,
    marginTop: 16,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
});
