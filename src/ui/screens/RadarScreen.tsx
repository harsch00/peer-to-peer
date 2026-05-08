/**
 * "Pulse" Mesh Radar screen — visual centerpiece of the app.
 */
import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {MeshRadarView} from '../components/MeshRadarView';
import {useTheme} from '../theme/ThemeProvider';
import {usePeersStore} from '../../state/peersStore';
import {usePeerDirectoryStore, getPeerAvatarStyle, getPeerLabel} from '../../state/peerDirectoryStore';
import {SignalBar} from '../components/SignalBar';
import {PeerAvatar} from '../components/PeerAvatar';
import {useMesh} from '../../hooks/useMesh';
import {useDiagnosticsStore} from '../../state/diagnosticsStore';

export function RadarScreen() {
  const theme = useTheme();
  const peers = usePeersStore(s => s.peers);
  usePeerDirectoryStore(s => s.byPeer);
  const mesh = useMesh();
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeLines, setProbeLines] = useState<string[] | null>(null);

  const runProbe = useCallback(async () => {
    if (!mesh || probeBusy) {
      return;
    }
    setProbeBusy(true);
    setProbeLines(null);
    try {
      const lines = await mesh.runBleDiscoveryProbe();
      setProbeLines(lines);
      useDiagnosticsStore.getState().push({
        ts: Date.now(),
        level: lines.some(l => l.includes('FAIL') || l.includes('NOT granted')) ? 'warn' : 'info',
        event: 'BLE_FORCE_DISCOVERY_PROBE',
        fields: {lines},
      });
    } catch (e) {
      const err = [`Probe crashed: ${String(e)}`];
      setProbeLines(err);
      useDiagnosticsStore.getState().push({
        ts: Date.now(),
        level: 'error',
        event: 'BLE_FORCE_DISCOVERY_PROBE',
        fields: {lines: err},
      });
    } finally {
      setProbeBusy(false);
    }
  }, [mesh, probeBusy]);

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

      <View
        style={[
          styles.probeCard,
          {
            marginTop: 20,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.platform === 'android' ? 24 : 10,
          },
        ]}>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fontFamily,
            fontWeight: '700',
            fontSize: 15,
          }}>
          Force peer discovery (BLE diagnostics)
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fontFamily,
            fontSize: 12,
            marginTop: 4,
          }}>
          Runs ~6s unfiltered BLE scan, checks Bluetooth state and permissions, and (on Android)
          reports mesh advertiser status. Use this when no BLE peers appear.
        </Text>
        <Pressable
          onPress={runProbe}
          disabled={!mesh || probeBusy}
          style={({pressed}) => [
            styles.probeButton,
            {
              backgroundColor: theme.colors.accent,
              opacity: !mesh || probeBusy ? 0.45 : pressed ? 0.85 : 1,
              borderRadius: theme.platform === 'android' ? 999 : 8,
            },
          ]}>
          {probeBusy ? (
            <ActivityIndicator color={theme.platform === 'windows' ? '#fff' : theme.m3.onPrimary} />
          ) : (
            <Text
              style={{
                color: theme.platform === 'windows' ? '#fff' : theme.m3.onPrimary,
                fontFamily: theme.fontFamily,
                fontWeight: '700',
              }}>
              Run discovery probe
            </Text>
          )}
        </Pressable>
        {!mesh && (
          <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamily, fontSize: 12, marginTop: 8}}>
            Mesh is still starting…
          </Text>
        )}
        {probeLines && probeLines.length > 0 ? (
          <View
            style={[
              styles.probeOutput,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: theme.colors.border,
              },
            ]}>
            <View style={{flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8}}>
              <Pressable
                onPress={() => setProbeLines(null)}
                style={({pressed}) => ({
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: theme.colors.accentSoft,
                  opacity: pressed ? 0.85 : 1,
                })}>
                <Text style={{color: theme.colors.accent, fontFamily: theme.fontFamily, fontWeight: '600'}}>
                  Dismiss
                </Text>
              </Pressable>
            </View>
            {probeLines.map((line, i) => (
              <Text
                key={`${i}-${line.slice(0, 24)}`}
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.fontFamilyMono,
                  fontSize: 11,
                  marginBottom: 4,
                }}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

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
            No peers detected yet — turn on Bluetooth or Wi-Fi or wait for a relay over Nostr.
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
              style={getPeerAvatarStyle(p.peerId ?? p.linkId, 'bottts')}
              online={p.secured}
            />
            <View style={{marginLeft: 12, flex: 1}}>
              <Text style={{color: theme.colors.text, fontFamily: theme.fontFamily, fontWeight: '600'}}>
                {p.peerId ? getPeerLabel(p.peerId) : 'Discovering…'}
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
  probeCard: {
    padding: 16,
    borderWidth: 1,
  },
  probeButton: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    minWidth: 200,
  },
  probeOutput: {
    marginTop: 14,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
});
