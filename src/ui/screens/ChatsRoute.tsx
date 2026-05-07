/**
 * The "Chats" route.
 *
 *  • windows  → conversation list (middle pane) + active chat (right pane).
 *  • android  → single column with drill-in transition into the chat view.
 */
import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import Animated, {SlideInRight} from 'react-native-reanimated';
import {useTheme} from '../theme/ThemeProvider';
import {usePeersStore} from '../../state/peersStore';
import {useMessagesStore, BROADCAST_KEY} from '../../state/messagesStore';
import {nicknameFor} from '../../core/crypto/identity';
import {PeerAvatar} from '../components/PeerAvatar';
import {SignalBar} from '../components/SignalBar';
import {MessageBubble} from '../components/MessageBubble';
import {ChatComposer} from '../components/ChatComposer';
import {maybeMesh} from '../../core/mesh/bootstrap';
import type {PeerLink} from '../../core/transport/types';
import type {ChatPayload} from '../../core/protocol/messageEnvelope';

type ConversationKey = string; // peerId or BROADCAST_KEY

interface Conversation {
  key: ConversationKey;
  title: string;
  subtitle: string;
  link?: PeerLink;
}

export function ChatsRoute({layout, listWidth = 320}: {layout: 'windows' | 'android'; listWidth?: number}) {
  const theme = useTheme();
  const peers = usePeersStore(s => s.peers);
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
        title: nicknameFor(peerId),
        subtitle: `${link.transport} · ${link.rssi.toFixed(0)} dBm`,
        link,
      });
    }
    return out;
  }, [peers]);

  const [active, setActive] = useState<ConversationKey>(BROADCAST_KEY);

  if (layout === 'windows') {
    return (
      <View style={styles.row}>
        <View style={[styles.list, {borderRightColor: theme.colors.border, width: listWidth}]}>
          <ConversationList
            conversations={conversations}
            activeKey={active}
            onSelect={setActive}
          />
        </View>
        <View style={styles.activePane}>
          <ActiveChat conversationKey={active} conversations={conversations} />
        </View>
      </View>
    );
  }
  // Android: drill-in
  return (
    <View style={{flex: 1}}>
      {active === BROADCAST_KEY ? (
        <ConversationList
          conversations={conversations}
          activeKey={active}
          onSelect={setActive}
        />
      ) : null}
      <ActiveChat conversationKey={active} conversations={conversations} />
    </View>
  );
}

function ConversationList({
  conversations,
  activeKey,
  onSelect,
}: {
  conversations: Conversation[];
  activeKey: ConversationKey;
  onSelect: (k: ConversationKey) => void;
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
        <Pressable
          key={c.key}
          onPress={() => onSelect(c.key)}
          style={({pressed, hovered}) => [
            styles.convoRow,
            {
              backgroundColor:
                activeKey === c.key
                  ? theme.colors.accentSoft
                  : hovered
                    ? theme.colors.surfaceAlt
                    : 'transparent',
              transform: [{translateY: hovered ? -1 : 0}],
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <PeerAvatar
            seed={c.key}
            size={42}
            style={c.key === BROADCAST_KEY ? 'pixel-art' : 'bottts'}
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
          {c.link && (
            <SignalBar rssi={c.link.rssi} reliability={c.link.reliability} compact />
          )}
        </Pressable>
      ))}
      {discoveredCount === 0 ? (
        <View
          style={[
            styles.emptyState,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
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
}: {
  conversationKey: ConversationKey;
  conversations: Conversation[];
}) {
  const theme = useTheme();
  const messages = useMessagesStore(s => s.byPeer[conversationKey] ?? []);
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

  const onReact = (messageId: string, emoji: string) => {
    onSendPayload({kind: 'reaction', messageId, emoji});
  };

  return (
    <View style={{flex: 1, backgroundColor: theme.colors.bg}}>
      <View style={[styles.chatHeader, {borderBottomColor: theme.colors.border}]}>
        <PeerAvatar
          seed={conversationKey}
          size={36}
          style={conversationKey === BROADCAST_KEY ? 'pixel-art' : 'bottts'}
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
      </View>

      <ScrollView contentContainerStyle={{padding: 16, gap: 4}}>
        {messages.length === 0 ? (
          <View style={{alignItems: 'center', marginTop: 40, opacity: 0.7}}>
            <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamily}}>
              No messages yet — say hi to the mesh.
            </Text>
          </View>
        ) : (
          messages.map(m => (
            <Animated.View
              entering={SlideInRight.duration(200)}
              key={m.id}>
              <MessageBubble message={m} isMe={m.fromPeerId === me?.peerId} onReact={onReact} />
            </Animated.View>
          ))
        )}
      </ScrollView>

      <ChatComposer onSend={onSend} onSendPayload={onSendPayload} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flex: 1, flexDirection: 'row'},
  list: {
    borderRightWidth: 1,
  },
  activePane: {flex: 1},
  convoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 6,
    borderRadius: 12,
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
