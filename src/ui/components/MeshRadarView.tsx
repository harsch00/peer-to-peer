/**
 * MeshRadarView — the "Pulse" radar.
 *
 * A glowing central node represents the local user. Peer nodes orbit at radii
 * proportional to RSSI strength; lines between them are color-coded by hop
 * distance (Direct = green, 1-Hop = yellow, multi-hop / weak = red).
 *
 * Animation:
 *   • Each node has a per-instance sine-wave drift to look "alive".
 *   • A radar sweep ring pulses outward continuously (Reanimated shared value).
 *   • Edge intensity tracks reliability so flapping peers visibly fade in/out.
 */
import React, {useEffect, useMemo} from 'react';
import {StyleSheet, View, Text} from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import {usePeersStore} from '../../state/peersStore';
import {useTheme} from '../theme/ThemeProvider';
import {colorForHops, HopColors} from '../theme/tokens';
import type {PeerLink} from '../../core/transport/types';

const ACircle = Animated.createAnimatedComponent(Circle);
const ALine = Animated.createAnimatedComponent(Line);

interface RadarSlot {
  /** Stable id for React keys only — do not pass live `PeerLink` into Reanimated worklets
   * (RSSI / handshake fields mutate on the JS object and trigger shareable warnings). */
  linkId: string;
  reliability: number;
  rssi: number;
  angle: number;
  radius: number;
  hops: number;
  freq: number;
  phase: number;
}

/**
 * Project an RSSI value (typically -30 to -95 dBm) onto a 0..1 distance,
 * where 0 = standing on top of the user and 1 = far edge of the radar.
 */
function rssiToDistance(rssi: number): number {
  if (rssi >= -45) return 0.18;
  if (rssi >= -60) return 0.35;
  if (rssi >= -75) return 0.55;
  if (rssi >= -85) return 0.75;
  return 0.92;
}

/**
 * Heuristic for how many hops a link sits at. We don't have authoritative
 * topology in phase-1, so secured + strong RSSI ≈ direct, secured + weak ≈
 * 1-hop, unsecured nostr links count as multi-hop.
 */
function inferHops(link: PeerLink): number {
  if (link.transport === 'nostr') return 3;
  if (!link.secured) return 2;
  if (link.rssi > -65) return 0;
  if (link.rssi > -80) return 1;
  return 2;
}

export function MeshRadarView({size = 320}: {size?: number}) {
  const theme = useTheme();
  const peers = usePeersStore(s => s.peers);
  const identity = usePeersStore(s => s.identity);

  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withRepeat(
      withTiming(1, {duration: 2400, easing: Easing.out(Easing.quad)}),
      -1,
      false,
    );
    return () => cancelAnimation(sweep);
  }, [sweep]);

  const slots = useMemo<RadarSlot[]>(() => {
    const n = Math.max(1, peers.length);
    return peers.map((link, i) => ({
      linkId: link.linkId,
      reliability: link.reliability,
      rssi: link.rssi,
      angle: (i / n) * Math.PI * 2 + (i * 0.13),
      radius: rssiToDistance(link.rssi),
      hops: inferHops(link),
      freq: 0.6 + (i % 4) * 0.18,
      phase: (i * 1.7) % (Math.PI * 2),
    }));
  }, [peers]);

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 12;

  // Background concentric rings + radial gradient halo around centre.
  return (
    <View style={[styles.container, {width: size, height: size + 64}]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={theme.colors.accent} stopOpacity={0.35} />
            <Stop offset="40%" stopColor={theme.colors.accent} stopOpacity={0.08} />
            <Stop offset="100%" stopColor={theme.colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Circle cx={cx} cy={cy} r={maxR} fill="url(#halo)" />

        {[0.25, 0.5, 0.75, 1].map((f, i) => (
          <Circle
            key={i}
            cx={cx}
            cy={cy}
            r={maxR * f}
            stroke={theme.colors.border}
            strokeWidth={0.7}
            fill="none"
            strokeDasharray={i % 2 ? '3 4' : undefined}
          />
        ))}

        <SweepRing cx={cx} cy={cy} maxR={maxR} sweep={sweep} color={theme.colors.accent} />

        {slots.map(slot => (
          <PeerEdge
            key={`edge-${slot.linkId}`}
            cx={cx}
            cy={cy}
            maxR={maxR}
            slot={slot}
            sweep={sweep}
          />
        ))}

        {slots.map(slot => (
          <PeerNode
            key={`node-${slot.linkId}`}
            cx={cx}
            cy={cy}
            maxR={maxR}
            slot={slot}
            sweep={sweep}
          />
        ))}

        {/* The user — central glowing node. */}
        <Circle cx={cx} cy={cy} r={9} fill={theme.colors.accent} opacity={0.95} />
        <Circle cx={cx} cy={cy} r={14} stroke={theme.colors.accent} strokeWidth={1.5} fill="none" opacity={0.6} />
        <SvgText
          x={cx}
          y={cy + 28}
          fill={theme.colors.text}
          fontFamily={theme.fontFamilyMono}
          fontSize={10}
          textAnchor="middle">
          {identity ? identity.peerId.slice(0, 8) : 'self'}
        </SvgText>
      </Svg>

      <RadarLegend />
    </View>
  );
}

function PeerEdge({
  cx,
  cy,
  maxR,
  slot,
  sweep,
}: {
  cx: number;
  cy: number;
  maxR: number;
  slot: RadarSlot;
  sweep: SharedValue<number>;
}) {
  const color = colorForHops(slot.hops, slot.rssi);
  const animatedProps = useAnimatedProps(() => {
    const t = sweep.value * Math.PI * 2;
    const drift = Math.sin(t * slot.freq + slot.phase) * 0.04;
    const r = (slot.radius + drift) * maxR;
    const px = cx + Math.cos(slot.angle + drift) * r;
    const py = cy + Math.sin(slot.angle + drift) * r;
    return {
      x1: cx,
      y1: cy,
      x2: px,
      y2: py,
      strokeOpacity: 0.4 + slot.reliability * 0.45,
    } as any;
  });
  return (
    <ALine
      animatedProps={animatedProps}
      stroke={color}
      strokeWidth={slot.hops === 0 ? 1.6 : 1.1}
      strokeDasharray={slot.hops > 1 ? '3 4' : undefined}
    />
  );
}

function PeerNode({
  cx,
  cy,
  maxR,
  slot,
  sweep,
}: {
  cx: number;
  cy: number;
  maxR: number;
  slot: RadarSlot;
  sweep: SharedValue<number>;
}) {
  const color = colorForHops(slot.hops, slot.rssi);
  const animatedProps = useAnimatedProps(() => {
    const t = sweep.value * Math.PI * 2;
    const drift = Math.sin(t * slot.freq + slot.phase) * 0.04;
    const r = (slot.radius + drift) * maxR;
    const px = cx + Math.cos(slot.angle + drift) * r;
    const py = cy + Math.sin(slot.angle + drift) * r;
    const pulse = 4.5 + (Math.sin(t * slot.freq * 2 + slot.phase) + 1) * 1.5;
    return {cx: px, cy: py, r: pulse} as any;
  });
  return (
    <G>
      <ACircle animatedProps={animatedProps} fill={color} opacity={0.95} />
    </G>
  );
}

function SweepRing({
  cx,
  cy,
  maxR,
  sweep,
  color,
}: {
  cx: number;
  cy: number;
  maxR: number;
  sweep: SharedValue<number>;
  color: string;
}) {
  const animatedProps = useAnimatedProps(() => {
    return {
      r: sweep.value * maxR,
      strokeOpacity: 1 - sweep.value,
    } as any;
  });
  return (
    <ACircle
      cx={cx}
      cy={cy}
      animatedProps={animatedProps}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
    />
  );
}

function RadarLegend() {
  const theme = useTheme();
  return (
    <View style={styles.legend}>
      <LegendDot color={HopColors.direct} label="Direct" />
      <LegendDot color={HopColors.oneHop} label="1 Hop" />
      <LegendDot color={HopColors.weak} label="Multi / Weak" />
      <Text
        style={{
          marginLeft: 'auto',
          color: theme.colors.textMuted,
          fontFamily: theme.fontFamilyMono,
          fontSize: 11,
        }}>
        BITCHAT MESH
      </Text>
    </View>
  );
}

function LegendDot({color, label}: {color: string; label: string}) {
  const theme = useTheme();
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', marginRight: 12}}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
          marginRight: 6,
        }}
      />
      <Text style={{color: theme.colors.text, fontSize: 12, fontFamily: theme.fontFamily}}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  legend: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 12,
  },
});
