/**
 * Composer field with Fluent / M3 styling, attachments, and poll entry (poll UI lives in parent overlay).
 */
import React, {useCallback, useRef, useState} from 'react';
import {Alert, Platform, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import type {ChatPayload} from '../../core/protocol/messageEnvelope';
import {pickAttachment} from '../../utils/pickAttachment';
import {INLINE_THRESHOLD, MAX_TRANSFER_SIZE} from '../../core/protocol/fileTransfer';
import {useFileTransferStore} from '../../state/fileTransferStore';

interface Props {
  onSend: (body: string) => Promise<void> | void;
  onSendPayload?: (payload: ChatPayload) => Promise<void> | void;
  /** Initiate a chunked file transfer for large files. */
  onSendFile?: (
    fileBytes: Uint8Array,
    fileName: string,
    mimeType: string,
    attachmentType: 'image' | 'video' | 'document',
  ) => Promise<void> | void;
  /** Opens the poll sheet (must not use Modal on RN Windows). Parent renders `PollBuilderOverlay`. */
  onOpenPoll?: () => void;
  placeholder?: string;
}

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

async function readFileBytes(uri: string): Promise<Uint8Array | undefined> {
  try {
    if (Platform.OS === 'windows') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const {NativeModules, TurboModuleRegistry} = require('react-native');
      const m = NativeModules as {P2PFilePicker?: {readFileBase64Async: (path: string) => Promise<string>}};
      const picker = m.P2PFilePicker ?? TurboModuleRegistry.get('P2PFilePicker');
      if (picker && typeof picker.readFileBase64Async === 'function') {
        const b64 = await picker.readFileBase64Async(uri);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const {Buffer} = require('buffer');
        const buf = Buffer.from(b64, 'base64');
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      }
    }
    const res = await fetch(uri);
    if (!res.ok) return undefined;
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab);
  } catch {
    return undefined;
  }
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatComposer({
  onSend,
  onSendPayload,
  onSendFile,
  onOpenPoll,
  placeholder = 'Type a message…',
}: Props) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const transfers = useFileTransferStore(s => s.transfers);

  // Find any active outbound transfer
  const activeOutbound = Object.values(transfers).find(
    t => t.direction === 'outbound' && t.status === 'in_progress',
  );

  const lastWasEnterRef = useRef(false);

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

  const handleKeyDown = useCallback((e: any) => {
    const key = e.nativeEvent?.key;
    const shift = !!e.nativeEvent?.shiftKey;
    if (key === 'Enter' && !shift) {
      lastWasEnterRef.current = true;
      e.preventDefault?.();
      submit();
    } else {
      lastWasEnterRef.current = false;
    }
  }, [submit]);

  const handleTextChange = useCallback((newText: string) => {
    if (Platform.OS === 'windows' && lastWasEnterRef.current) {
      lastWasEnterRef.current = false;
      return;
    }
    setText(newText);
  }, []);

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
        const fileBytes = await readFileBytes(file.uri);
        if (!fileBytes || fileBytes.byteLength === 0) {
          Alert.alert('Attachment', 'Could not read the selected file.');
          return;
        }

        // Check max transfer size
        if (fileBytes.byteLength > MAX_TRANSFER_SIZE) {
          Alert.alert(
            'File too large',
            `Maximum file size is ${humanSize(MAX_TRANSFER_SIZE)}. This file is ${humanSize(fileBytes.byteLength)}.`,
          );
          return;
        }

        // Small files: send inline (fast path)
        if (fileBytes.byteLength <= INLINE_THRESHOLD) {
          const dataBase64 = bytesToBase64(fileBytes);
          await sendPayload({
            kind: 'attachment',
            attachmentType: kind === 'document' ? 'document' : kind,
            name: file.name,
            uri: file.uri,
            dataBase64,
            sizeBytes: file.sizeBytes,
            mimeType: file.mimeType,
          });
          return;
        }

        // Large files: chunked transfer via BLE / Wi-Fi Direct
        if (onSendFile) {
          await onSendFile(
            fileBytes,
            file.name,
            file.mimeType ?? 'application/octet-stream',
            kind === 'document' ? 'document' : kind,
          );
        } else {
          // Fallback: send metadata only if mesh sendFile not wired
          Alert.alert(
            'Large file',
            `This file is ${humanSize(fileBytes.byteLength)}. Chunked transfer is not available for this conversation.`,
          );
        }
      } catch (e) {
        Alert.alert('Attachment', e instanceof Error ? e.message : 'Could not read file');
      }
    },
    [onSendPayload, sending, sendPayload, onSendFile],
  );

  return (
    <View style={{backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, borderTopWidth: 0.5}}>
      {activeOutbound ? (
        <View style={styles.transferBar}>
          <View style={{flex: 1, gap: 2}}>
            <Text style={{color: theme.colors.text, fontFamily: theme.fontFamily, fontSize: 12, fontWeight: '600'}}>
              Sending {activeOutbound.fileName}… {Math.round(activeOutbound.progress * 100)}%
            </Text>
            <View
              style={[
                styles.progressTrack,
                {backgroundColor: theme.colors.surfaceAlt},
              ]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: theme.colors.accent,
                    width: `${Math.round(activeOutbound.progress * 100)}%` as any,
                  },
                ]}
              />
            </View>
            <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamilyMono, fontSize: 10}}>
              {activeOutbound.receivedChunks}/{activeOutbound.totalChunks} chunks · {humanSize(activeOutbound.fileSize)}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Action
          label="Image"
          disabled={!onSendPayload || sending || !!activeOutbound}
          onPress={() => browseAndSend('image')}
        />
        <Action
          label="Video"
          disabled={!onSendPayload || sending || !!activeOutbound}
          onPress={() => browseAndSend('video')}
        />
        <Action
          label="Doc"
          disabled={!onSendPayload || sending || !!activeOutbound}
          onPress={() => browseAndSend('document')}
        />
        <Action
          label="Poll"
          disabled={!onSendPayload || sending || !onOpenPoll || !!activeOutbound}
          onPress={() => onOpenPoll?.()}
        />
      </View>
      <View style={styles.row}>
        <TextInput
          value={text}
          onChangeText={handleTextChange}
          {...(Platform.OS === 'windows' ? {onKeyDown: handleKeyDown} : {})}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          multiline
          onSubmitEditing={Platform.OS !== 'windows' ? submit : undefined}
          blurOnSubmit={Platform.OS !== 'windows'}
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
  transferBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
});

