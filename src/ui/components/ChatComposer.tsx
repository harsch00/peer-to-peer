/**
 * Composer field with a Fluent / M3 styled send button.
 */
import React, {useCallback, useState} from 'react';
import {Platform, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import type {ChatPayload} from '../../core/protocol/messageEnvelope';

interface Props {
  onSend: (body: string) => Promise<void> | void;
  onSendPayload?: (payload: ChatPayload) => Promise<void> | void;
  placeholder?: string;
}

export function ChatComposer({onSend, onSendPayload, placeholder = 'Type a message…'}: Props) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const submit = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSend(body);
      setText('');
    } finally {
      setSending(false);
    }
  }, [text, sending, onSend]);

  const sendPayload = useCallback(
    async (payload: ChatPayload) => {
      if (!onSendPayload || sending) return;
      setSending(true);
      try {
        await onSendPayload(payload);
        setText('');
      } finally {
        setSending(false);
      }
    },
    [onSendPayload, sending],
  );

  const attachmentName = text.trim() || 'Untitled attachment';
  const pollParts = text.split('|').map(p => p.trim()).filter(Boolean);
  const pollQuestion = pollParts[0] || 'Quick poll';
  const pollOptions = pollParts.length >= 3 ? pollParts.slice(1) : ['Yes', 'No'];

  return (
    <View style={{backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, borderTopWidth: 0.5}}>
      <View style={styles.actions}>
        <Action label="Image" disabled={!onSendPayload || sending} onPress={() => sendPayload({kind: 'attachment', attachmentType: 'image', name: attachmentName})} />
        <Action label="Video" disabled={!onSendPayload || sending} onPress={() => sendPayload({kind: 'attachment', attachmentType: 'video', name: attachmentName})} />
        <Action label="Doc" disabled={!onSendPayload || sending} onPress={() => sendPayload({kind: 'attachment', attachmentType: 'document', name: attachmentName})} />
        <Action
          label="Poll"
          disabled={!onSendPayload || sending}
          onPress={() =>
            sendPayload({
              kind: 'poll',
              pollId: `${Date.now()}`,
              question: pollQuestion,
              options: pollOptions.map((option, index) => ({id: String(index + 1), text: option})),
            })
          }
        />
      </View>
      <View style={styles.row}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          multiline
          onSubmitEditing={submit}
          blurOnSubmit
          style={[
            styles.input,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
              fontFamily: theme.fontFamily,
              borderRadius: theme.platform === 'android' ? 28 : 8,
            },
          ]}
        />
        <Pressable
          onPress={submit}
          disabled={!text.trim() || sending}
          style={({pressed}) => [
            styles.sendBtn,
            {
              backgroundColor: theme.colors.accent,
              borderRadius: theme.platform === 'android' ? 9999 : 6,
              opacity: !text.trim() || sending ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}>
          <Text
            style={{
              color: theme.platform === 'windows' ? '#fff' : theme.m3.onPrimary,
              fontFamily: theme.fontFamily,
              fontWeight: '700',
              fontSize: 14,
            }}>
            {Platform.OS === 'windows' ? 'Send' : '➤'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Action({label, disabled, onPress}: {label: string; disabled: boolean; onPress: () => void}) {
  const theme = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.action,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.border,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
      ]}>
      <Text style={{color: theme.colors.text, fontFamily: theme.fontFamilyMono, fontSize: 11}}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  action: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    fontSize: 14,
  },
  sendBtn: {
    minWidth: 44,
    height: 40,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
