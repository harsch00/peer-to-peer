/**
 * Peer avatar — DiceBear "Bottts" / "Adventurer" set, deterministic per peer.
 */
import React, {useState} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {dicebearUrl, AvatarStyle} from '../../utils/dicebear';
import {useTheme} from '../theme/ThemeProvider';

interface Props {
  seed: string;
  size?: number;
  style?: AvatarStyle;
  online?: boolean;
}

export function PeerAvatar({seed, size = 44, style = 'bottts', online}: Props) {
  const theme = useTheme();
  const [errored, setErrored] = useState(false);

  const initials = seed.slice(0, 2).toUpperCase();
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.accentSoft,
        },
      ]}>
      {!errored ? (
        <Image
          source={{uri: dicebearUrl(seed, style)}}
          style={{width: size, height: size, borderRadius: size / 2}}
          onError={() => setErrored(true)}
        />
      ) : (
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fontFamilyMono,
            fontWeight: '700',
            fontSize: size * 0.36,
          }}>
          {initials}
        </Text>
      )}

      {online !== undefined && (
        <View
          style={[
            styles.presence,
            {
              backgroundColor: online ? theme.colors.success : theme.colors.textMuted,
              borderColor: theme.colors.bg,
              width: Math.max(8, size * 0.22),
              height: Math.max(8, size * 0.22),
              borderRadius: Math.max(4, size * 0.11),
              right: 0,
              bottom: 0,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  presence: {
    position: 'absolute',
    borderWidth: 2,
  },
});
