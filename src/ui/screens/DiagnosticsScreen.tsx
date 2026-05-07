/**
 * Diagnostic dashboard — log + live stats grid.
 */
import React, {useMemo} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {DiagnosticLog} from '../components/DiagnosticLog';
import {useDiagnosticsStore} from '../../state/diagnosticsStore';
import {usePeersStore} from '../../state/peersStore';

export function DiagnosticsScreen() {
  const theme = useTheme();
  const events = useDiagnosticsStore(s => s.events);
  const clear = useDiagnosticsStore(s => s.clear);
  const peers = usePeersStore(s => s.peers);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.event] = (counts[e.event] ?? 0) + 1;
    return {
      total: events.length,
      delivered: counts.PACKET_DELIVERED ?? 0,
      relayed: counts.PACKET_RELAYED ?? 0,
      duplicates: counts.PACKET_DUPLICATE ?? 0,
      handshakes: counts.NOISE_HANDSHAKE_OK ?? 0,
      decryptFails: counts.DECRYPT_FAILED ?? 0,
    };
  }, [events]);

  return (
    <View style={{flex: 1, padding: 16}}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
        <Text
          style={{
            fontSize: theme.platform === 'windows' ? 28 : 28,
            fontWeight: '700',
            color: theme.colors.text,
            fontFamily: theme.fontFamily,
          }}>
          Diagnostics
        </Text>
        <Pressable
          onPress={clear}
          style={({pressed}) => [
            styles.clearBtn,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <Text style={{color: theme.colors.text, fontFamily: theme.fontFamilyMono, fontSize: 12}}>
            CLEAR
          </Text>
        </Pressable>
      </View>

      <View style={styles.statsGrid}>
        <Stat label="Peers" value={String(peers.length)} accent={theme.colors.accent} />
        <Stat label="Events" value={String(stats.total)} accent={theme.colors.accent} />
        <Stat label="Delivered" value={String(stats.delivered)} accent={theme.colors.success} />
        <Stat label="Relayed" value={String(stats.relayed)} accent="#EAB308" />
        <Stat label="Dups" value={String(stats.duplicates)} accent="#A78BFA" />
        <Stat label="Handshakes" value={String(stats.handshakes)} accent={theme.colors.accent} />
      </View>

      <View style={{flex: 1, marginTop: 12}}>
        <DiagnosticLog />
      </View>
    </View>
  );
}

function Stat({label, value, accent}: {label: string; value: string; accent: string}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.statBox,
        {
          backgroundColor: theme.colors.surface,
          borderColor: accent + '55',
          borderRadius: theme.platform === 'android' ? 20 : 10,
        },
      ]}>
      <Text style={{color: theme.colors.textMuted, fontSize: 10, letterSpacing: 0.5, fontFamily: theme.fontFamilyMono}}>
        {label.toUpperCase()}
      </Text>
      <Text style={{color: accent, fontSize: 22, fontWeight: '700', fontFamily: theme.fontFamilyMono}}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statBox: {
    minWidth: 100,
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
});
