/**
 * "Pulse" Mesh Radar screen — visual centerpiece of the app.
 */
import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {MeshRadarView} from '../components/MeshRadarView';
import {useTheme} from '../theme/ThemeProvider';
import {usePeersStore} from '../../state/peersStore';
import {nicknameFor} from '../../core/crypto/identity';
import {SignalBar} from '../components/SignalBar';
import {PeerAvatar} from '../components/PeerAvatar';

export function RadarScreen() {
  const theme = useTheme();
  const peers = usePeersStore(s => s.peers);

  return (
    <ScrollView contentContainerStyle={{padding: 24}} style={{flex: 1}}>
      <Text
        style={{
          fontSize: theme.platform === 'windows' ? 28 : 32,
          fontWeight: '700',
          color: theme.colors.text,
          fontFamily: theme.fontFamily,
        }}>
        Pulse · Mesh Radar
      </Text>
      <Text style={{color: theme.colors.textMuted, marginTop: 4, fontFamily: theme.fontFamily}}>
        Live view of every peer your node can reach. Concentric rings represent
        approximate radio distance. Connection color encodes hop count.
      </Text>

      <View style={{alignItems: 'center', marginTop: 24}}>
        <MeshRadarView size={Math.min(360, 320)} />
      </View>

      <Text
        style={{
          marginTop: 32,
          fontSize: 16,
          fontWeight: '700',
          color: theme.colors.text,
          fontFamily: theme.fontFamily,
        }}>
        Connected peers ({peers.length})
      </Text>

      <View style={{gap: 8, marginTop: 12}}>
        {peers.length === 0 && (
          <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamily}}>
            No peers detected yet — turn on Bluetooth or Wi-Fi or wait for a
            relay over Nostr.
          </Text>
        )}
        {peers.map(p => (
          <View
            key={p.linkId}
            style={[
              styles.row,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.platform === 'android' ? 24 : 10,
              },
            ]}>
            <PeerAvatar
              seed={p.peerId ?? p.linkId}
              size={40}
              style="bottts"
              online={p.secured}
            />
            <View style={{marginLeft: 12, flex: 1}}>
              <Text style={{color: theme.colors.text, fontFamily: theme.fontFamily, fontWeight: '600'}}>
                {p.peerId ? nicknameFor(p.peerId) : 'Discovering…'}
              </Text>
              <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamilyMono, fontSize: 11}}>
                {p.transport.toUpperCase()} · {p.linkId}
              </Text>
            </View>
            <SignalBar rssi={p.rssi} reliability={p.reliability} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
  },
});
