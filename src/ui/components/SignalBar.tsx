/**
 * Battery-style signal strength bar.
 *
 * Plus a "reliability score" pill — calculated by the transport layer as
 * (successfully delivered packets / total attempts) over a sliding window.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';

const BARS = 5;

function rssiToBars(rssi: number): number {
  if (rssi >= -50) return 5;
  if (rssi >= -60) return 4;
  if (rssi >= -70) return 3;
  if (rssi >= -80) return 2;
  if (rssi >= -90) return 1;
  return 0;
}

export function SignalBar({
  rssi,
  reliability,
  compact = false,
}: {
  rssi: number;
  reliability: number;
  compact?: boolean;
}) {
  const theme = useTheme();
  const filled = rssiToBars(rssi);
  const reliabilityPct = Math.round(reliability * 100);
  const reliabilityColor =
    reliabilityPct >= 90
      ? theme.colors.success
      : reliabilityPct >= 70
        ? '#EAB308'
        : theme.colors.danger;

  return (
    <View style={[styles.row, compact && {transform: [{scale: 0.85}]}]}>
      <View style={styles.bars}>
        {Array.from({length: BARS}).map((_, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: 6 + i * 2,
                backgroundColor:
                  i < filled ? theme.colors.accent : theme.colors.surfaceAlt,
              },
            ]}
          />
        ))}
      </View>
      {!compact && (
        <Text
          style={{
            marginLeft: 8,
            fontFamily: theme.fontFamilyMono,
            fontSize: 11,
            color: theme.colors.textMuted,
          }}>
          {rssi.toFixed(0)} dBm
        </Text>
      )}
      <View
        style={[
          styles.relPill,
          {
            backgroundColor: reliabilityColor + '22',
            borderColor: reliabilityColor + '66',
          },
        ]}>
        <Text style={{color: reliabilityColor, fontSize: 11, fontWeight: '700', fontFamily: theme.fontFamilyMono}}>
          {reliabilityPct}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-end'},
  bars: {flexDirection: 'row', alignItems: 'flex-end', gap: 2},
  bar: {width: 4, borderRadius: 1.5},
  relPill: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'center',
  },
});
