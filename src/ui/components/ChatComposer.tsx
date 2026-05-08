/**
 * Composer field with Fluent / M3 styling, attachments, and poll entry (poll UI lives in parent overlay).
 */
import React, {useCallback, useState} from 'react';
import {Alert, Platform, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import type {ChatPayload} from '../../core/protocol/messageEnvelope';
import {pickAttachment} from '../../utils/pickAttachment';

interface Props {
  onSend: (body: string) => Promise<void> | void;
  onSendPayload?: (payload: ChatPayload) => Promise<void> | void;
  /** Opens the poll sheet (must not use Modal on RN Windows). Parent renders `PollBuilderOverlay`. */
  onOpenPoll?: () => void;
  placeholder?: string;
}

const MAX_INLINE_ATTACHMENT_BYTES = 180 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const btoaFn = (globalThis as unknown as {btoa?: (s: string) => string}).btoa;
  if (typeof btoaFn === 'function') {
    return btoaFn(binary);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {Buffer} = require('buffer');
  return Buffer.from(bytes).toString('base64');
}

async function readInlineAttachmentBase64(uri: string): Promise<string | undefined> {
  try {
    const res = await fetch(uri);
    if (!res.ok) return undefined;
    const ab = await res.arrayBuffer();
    const bytes = new Uint8Array(ab);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_INLINE_ATTACHMENT_BYTES) {
      return undefined;
    }
    return bytesToBase64(bytes);
  } catch {
    return undefined;
  }
}

export function ChatComposer({onSend, onSendPayload, onOpenPoll, placeholder = 'Type a message…'}: Props) {
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
      } finally {
        setSending(false);
      }
    },
    [onSendPayload, sending],
  );

  const browseAndSend = useCallback(
    async (kind: 'image' | 'video' | 'document') => {
      if (!onSendPayload || sending) return;
      try {
        const file = await pickAttachment(kind);
        if (!file) return;
        const dataBase64 = await readInlineAttachmentBase64(file.uri);
        if (!dataBase64) {
          Alert.alert(
            'Attachment is large',
            'This file exceeds inline mesh limits; sending metadata only. Pick smaller media for reliable cross-device transfer.',
          );
        }
        await sendPayload({
          kind: 'attachment',
          attachmentType: kind === 'document' ? 'document' : kind,
          name: file.name,
          uri: file.uri,
          dataBase64,
          sizeBytes: file.sizeBytes,
          mimeType: file.mimeType,
        });
      } catch (e) {
        Alert.alert('Attachment', e instanceof Error ? e.message : 'Could not read file');
      }
    },
    [onSendPayload, sending, sendPayload],
  );

  return (
    <View style={{backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, borderTopWidth: 0.5}}>
      <View style={styles.actions}>
        <Action
          label="Image"
          disabled={!onSendPayload || sending}
          onPress={() => browseAndSend('image')}
        />
        <Action
          label="Video"
          disabled={!onSendPayload || sending}
          onPress={() => browseAndSend('video')}
        />
        <Action
          label="Doc"
          disabled={!onSendPayload || sending}
          onPress={() => browseAndSend('document')}
        />
        <Action
          label="Poll"
          disabled={!onSendPayload || sending || !onOpenPoll}
          onPress={() => onOpenPoll?.()}
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
