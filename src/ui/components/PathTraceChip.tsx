/**
 * "Routing Details" chip + popover mini-map.
 *
 * Tapping the chip opens a tiny SVG that lays out the path of peer IDs in
 * order (left → right) with arrows between each hop.
 */
import React, {useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Defs, Marker, Path, Text as SvgText} from 'react-native-svg';
import {useTheme} from '../theme/ThemeProvider';
import {colorForHops} from '../theme/tokens';

interface Props {
  path: string[];
  hopCount: number;
  latencyMs: number;
}

export function PathTraceChip({path, hopCount, latencyMs}: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({pressed}) => [
          styles.chip,
          {
            backgroundColor: theme.colors.accentSoft,
            opacity: pressed ? 0.8 : 1,
          },
        ]}>
        <Text style={{color: theme.colors.accent, fontSize: 11, fontWeight: '700', fontFamily: theme.fontFamilyMono}}>
          ROUTE · {hopCount}h · {latencyMs}ms
        </Text>
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
            onPress={() => {/* eat tap */}}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 16,
                fontWeight: '700',
                marginBottom: 8,
                fontFamily: theme.fontFamily,
              }}>
              Packet Route
            </Text>

            <PathSvg path={path} hopCount={hopCount} />

            <View style={{flexDirection: 'row', marginTop: 16, gap: 10}}>
              <Stat label="Hops" value={String(hopCount)} />
              <Stat label="Latency" value={`${latencyMs} ms`} />
              <Stat label="Length" value={`${path.length} nodes`} />
            </View>

            <Text style={{marginTop: 12, color: theme.colors.textMuted, fontSize: 12, fontFamily: theme.fontFamilyMono}}>
              {path.join('  →  ')}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function PathSvg({path, hopCount}: {path: string[]; hopCount: number}) {
  const theme = useTheme();
  const w = 320;
  const h = 96;
  const cy = h / 2;
  const positions = path.length === 1
    ? [{x: w / 2, y: cy}]
    : path.map((_, i) => ({x: 24 + (i * (w - 48)) / Math.max(1, path.length - 1), y: cy}));
  return (
    <Svg width={w} height={h}>
      <Defs>
        <Marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <Path d="M0,0 L6,3 L0,6 Z" fill={theme.colors.accent} />
        </Marker>
      </Defs>
      {positions.slice(0, -1).map((p, i) => {
        const next = positions[i + 1];
        return (
          <Path
            key={i}
            d={`M ${p.x + 10} ${p.y} L ${next.x - 10} ${next.y}`}
            stroke={colorForHops(i + 1 >= hopCount ? hopCount : i + 1)}
            strokeWidth={1.5}
            markerEnd="url(#arrow)"
          />
        );
      })}
      {positions.map((p, i) => (
        <React.Fragment key={i}>
          <Circle cx={p.x} cy={p.y} r={10} fill={i === 0 ? theme.colors.accent : theme.colors.surfaceAlt} stroke={theme.colors.border} />
          <SvgText
            x={p.x}
            y={p.y + 26}
            fontSize={9}
            fontFamily={theme.fontFamilyMono}
            fill={theme.colors.textMuted}
            textAnchor="middle">
            {path[i].slice(0, 6)}
          </SvgText>
        </React.Fragment>
      ))}
    </Svg>
  );
}

function Stat({label, value}: {label: string; value: string}) {
  const theme = useTheme();
  return (
    <View style={[styles.statBox, {backgroundColor: theme.colors.surfaceAlt}]}>
      <Text style={{color: theme.colors.textMuted, fontSize: 10, letterSpacing: 0.4, fontFamily: theme.fontFamilyMono}}>
        {label.toUpperCase()}
      </Text>
      <Text style={{color: theme.colors.text, fontSize: 14, fontWeight: '700', fontFamily: theme.fontFamily}}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 4,
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: 360,
    maxWidth: '100%',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  statBox: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'flex-start',
  },
});
