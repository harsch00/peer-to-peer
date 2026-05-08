/**
 * Profile / Identity screen.
 *
 *  • Cryptographically generated identity preview (DiceBear avatar).
 *  • Public-key fingerprint for QR verification.
 *  • Reset / regenerate identity controls.
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {usePeersStore} from '../../state/peersStore';
import {PeerAvatar} from '../components/PeerAvatar';
import {useProfileStore} from '../../state/profileStore';
import type {AvatarStyle} from '../../utils/dicebear';

const AVATAR_STYLES: AvatarStyle[] = ['adventurer', 'bottts', 'lorelei', 'pixel-art'];

export function ProfileScreen() {
  const theme = useTheme();
  const meshIdentity = usePeersStore(s => s.identity);
  const profile = useProfileStore(s => s.profile);
  const hydrate = useProfileStore(s => s.hydrate);
  const setDisplayName = useProfileStore(s => s.setDisplayName);
  const setAvatarStyle = useProfileStore(s => s.setAvatarStyle);
  const regenerateIdentity = useProfileStore(s => s.regenerateIdentity);
  const [nameDraft, setNameDraft] = useState(profile?.displayName ?? '');

  useEffect(() => {
    if (!profile) {
      hydrate()
        .then(next => {
          usePeersStore.getState().setIdentity(next.identity);
          setNameDraft(next.displayName);
        })
        .catch(() => undefined);
    } else {
      setNameDraft(profile.displayName);
    }
  }, [hydrate, profile]);

  const identity = profile?.identity ?? meshIdentity ?? null;

  if (!identity || !profile) {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}}>
        <Text style={{color: theme.colors.text, fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 18}}>
          Profile is loading…
        </Text>
        <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamily, marginTop: 8, textAlign: 'center'}}>
          If this stays visible, the local crypto polyfill failed to install. Check Diagnostics for "P2PRandom" or
          "crypto.getRandomValues" entries.
        </Text>
        <Pressable
          onPress={() => hydrate().catch(() => undefined)}
          style={({pressed}) => ({
            marginTop: 16,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceAlt,
            opacity: pressed ? 0.85 : 1,
          })}>
          <Text style={{color: theme.colors.text, fontFamily: theme.fontFamily, fontWeight: '600'}}>
            Retry profile setup
          </Text>
        </Pressable>
      </View>
    );
  }

  const onRegen = () => {
    const message =
      'Generate a brand-new cryptographic identity? You will lose existing sessions but no data leaves the device.';
    if (typeof Alert !== 'undefined') {
      Alert.alert('Regenerate identity', message, [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            const next = await regenerateIdentity();
            usePeersStore.getState().setIdentity(next.identity);
          },
        },
      ]);
    } else {
      regenerateIdentity().then(next => usePeersStore.getState().setIdentity(next.identity));
    }
  };

  const saveName = () => {
    setDisplayName(nameDraft);
  };

  return (
    <ScrollView contentContainerStyle={{padding: 24}}>
      <Text
        style={{
          fontSize: theme.platform === 'windows' ? 28 : 32,
          fontWeight: '700',
          color: theme.colors.text,
          fontFamily: theme.fontFamily,
        }}>
        Identity
      </Text>
      <Text style={{color: theme.colors.textMuted, marginTop: 4, fontFamily: theme.fontFamily}}>
        Account-less. Your identity is a cryptographic key pair generated locally
        on this device — no email, no phone, no server.
      </Text>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.platform === 'android' ? 28 : 12,
          },
        ]}>
        <PeerAvatar seed={identity.fingerprint} size={92} style={profile.avatarStyle} online />
        <View style={{marginLeft: 16, flex: 1}}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.fontFamily,
              fontSize: 20,
              fontWeight: '700',
            }}>
            {profile.displayName}
          </Text>
          <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamilyMono, fontSize: 12, marginTop: 4}}>
            peerId   {identity.peerId}
          </Text>
          <Text
            style={{color: theme.colors.textMuted, fontFamily: theme.fontFamilyMono, fontSize: 12}}
            selectable>
            sha-256  {identity.fingerprint.match(/.{1,4}/g)?.join(' ') ?? identity.fingerprint}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.editor,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.platform === 'android' ? 24 : 12,
          },
        ]}>
        <Text style={{color: theme.colors.text, fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 16}}>
          Public profile
        </Text>
        <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamily, marginTop: 4}}>
          This is stored locally and used as your display identity in the app.
        </Text>
        <TextInput
          value={nameDraft}
          onChangeText={setNameDraft}
          onBlur={saveName}
          onSubmitEditing={saveName}
          placeholder="Display name"
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.bg,
              fontFamily: theme.fontFamily,
            },
          ]}
        />
        <View style={styles.avatarChoices}>
          {AVATAR_STYLES.map(style => (
            <Pressable
              key={style}
              onPress={() => setAvatarStyle(style)}
              style={({pressed}) => [
                styles.avatarChoice,
                {
                  borderColor:
                    profile.avatarStyle === style ? theme.colors.accent : theme.colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}>
              <PeerAvatar seed={identity.fingerprint} size={42} style={style} />
              <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamilyMono, fontSize: 10}}>
                {style}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{marginTop: 16, gap: 10}}>
        <InfoRow label="Curve" value="Curve25519 (X25519)" />
        <InfoRow label="Cipher" value="AES-256-GCM" />
        <InfoRow label="Hash" value="SHA-256" />
        <InfoRow label="Pattern" value="Noise_XX_25519_AESGCM_SHA256" />
      </View>

      <Pressable
        onPress={onRegen}
        style={({pressed}) => [
          styles.danger,
          {
            backgroundColor: theme.colors.danger,
            borderRadius: theme.platform === 'android' ? 9999 : 8,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <Text style={{color: '#fff', fontWeight: '700', fontFamily: theme.fontFamily}}>
          Regenerate identity
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function InfoRow({label, value}: {label: string; value: string}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 14,
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: theme.platform === 'android' ? 16 : 8,
      }}>
      <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamily}}>{label}</Text>
      <Text style={{color: theme.colors.text, fontFamily: theme.fontFamilyMono}}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    marginTop: 24,
    borderWidth: 1,
  },
  danger: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  editor: {
    marginTop: 16,
    padding: 16,
    borderWidth: 1,
  },
  input: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  avatarChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  avatarChoice: {
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
  },
});
