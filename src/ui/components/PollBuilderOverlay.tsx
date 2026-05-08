/**
 * Full-pane poll editor (no React Native Modal — Modal is not implemented on RN Windows Paper).
 */
import React, {useCallback, useState} from 'react';
import {Alert, Platform, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import type {ChatPayload} from '../../core/protocol/messageEnvelope';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: ChatPayload) => void | Promise<void>;
}

export function PollBuilderOverlay({visible, onClose, onSubmit}: Props) {
  const theme = useTheme();
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  const reset = useCallback(() => {
    setPollQuestion('');
    setPollOptions(['', '']);
  }, []);

  const submitPoll = useCallback(async () => {
    const q = pollQuestion.trim();
    const opts = pollOptions.map(o => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) {
      Alert.alert('Poll', 'Add a question and at least two options.');
      return;
    }
    await onSubmit({
      kind: 'poll',
      pollId: `poll-${Date.now()}`,
      question: q,
      options: opts.map((t, i) => ({id: `o${i + 1}`, text: t})),
    });
    reset();
    onClose();
  }, [pollQuestion, pollOptions, onSubmit, onClose, reset]);

  if (!visible) {
    return null;
  }

  return (
    <View
      style={[StyleSheet.absoluteFillObject, styles.wrap]}
      pointerEvents="box-none"
      accessibilityViewIsModal={Platform.OS !== 'windows'}>
      <Pressable
        style={[StyleSheet.absoluteFillObject, {backgroundColor: 'rgba(0,0,0,0.45)'}]}
        onPress={onClose}
        accessibilityLabel="Dismiss poll editor"
      />
      <View style={[styles.panelWrap]} pointerEvents="box-none">
        <View
          style={[
            styles.modalCard,
            {backgroundColor: theme.colors.surface, borderColor: theme.colors.border},
          ]}>
          <Text style={[styles.modalTitle, {color: theme.colors.text, fontFamily: theme.fontFamily}]}>
            New poll
          </Text>
          <TextInput
            value={pollQuestion}
            onChangeText={setPollQuestion}
            placeholder="Question"
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.modalInput,
              {
                color: theme.colors.text,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
                fontFamily: theme.fontFamily,
              },
            ]}
          />
          {pollOptions.map((opt, idx) => (
            <TextInput
              key={idx}
              value={opt}
              onChangeText={v => {
                const next = [...pollOptions];
                next[idx] = v;
                setPollOptions(next);
              }}
              placeholder={`Option ${idx + 1}`}
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.modalInput,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                  fontFamily: theme.fontFamily,
                },
              ]}
            />
          ))}
          <View style={styles.modalActions}>
            <Pressable
              onPress={() => setPollOptions([...pollOptions, ''])}
              style={[styles.secondaryBtn, {borderColor: theme.colors.border}]}>
              <Text style={{color: theme.colors.text, fontFamily: theme.fontFamily}}>Add option</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (pollOptions.length > 2) {
                  setPollOptions(pollOptions.slice(0, -1));
                }
              }}
              style={[styles.secondaryBtn, {borderColor: theme.colors.border}]}>
              <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamily}}>Remove last</Text>
            </Pressable>
          </View>
          <View style={[styles.modalActions, {marginTop: 8}]}>
            <Pressable
              onPress={() => {
                reset();
                onClose();
              }}
              style={[styles.secondaryBtn, {borderColor: theme.colors.border}]}>
              <Text style={{color: theme.colors.text, fontFamily: theme.fontFamily}}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => submitPoll().catch(() => undefined)}
              style={[styles.primaryBtn, {backgroundColor: theme.colors.accent}]}>
              <Text
                style={{
                  color: theme.platform === 'windows' ? '#fff' : theme.m3.onPrimary,
                  fontFamily: theme.fontFamily,
                  fontWeight: '700',
                }}>
                Send poll
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 2000,
    elevation: 2000,
  },
  panelWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  modalTitle: {fontSize: 18, fontWeight: '700', marginBottom: 4},
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  modalActions: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  secondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  primaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginLeft: 'auto',
  },
});
