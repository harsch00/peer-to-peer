/**
 * "Diagnostic Dashboard" — a green/amber monospace log of mesh events on a
 * dark backdrop, regardless of the active light/dark scheme.
 */
import React, {useMemo} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {useDiagnosticsStore} from '../../state/diagnosticsStore';
import type {DiagEvent} from '../../core/mesh/meshNode';

const LEVEL_COLOR: Record<DiagEvent['level'], string> = {
  info: '#34D399', // emerald
  warn: '#F59E0B', // amber
  error: '#F87171', // rose
};

export function DiagnosticLog() {
  const theme = useTheme();
  const events = useDiagnosticsStore(s => s.events);
  const ordered = useMemo(() => [...events].slice(-300), [events]);

  return (
    <View style={[styles.frame, {borderColor: theme.colors.border}]}>
      <View style={styles.titleBar}>
        <View style={[styles.dot, {backgroundColor: '#FF6058'}]} />
        <View style={[styles.dot, {backgroundColor: '#FFBD2E'}]} />
        <View style={[styles.dot, {backgroundColor: '#28C940'}]} />
        <Text style={styles.titleText}>p2pmesh ~ diagnostics</Text>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{padding: 12}}>
        {ordered.map((e, i) => (
          <Text key={i} style={[styles.line, {color: LEVEL_COLOR[e.level]}]}>
            <Text style={{color: '#94A3B8'}}>{formatTs(e.ts)}  </Text>
            <Text style={{color: '#FFFFFF'}}>[{e.level.toUpperCase().padEnd(5)}] </Text>
            <Text>{e.event}</Text>
            {e.fields ? (
              <Text style={{color: '#A78BFA'}}>  {formatFields(e.fields)}</Text>
            ) : null}
          </Text>
        ))}
        {ordered.length === 0 && (
          <Text style={[styles.line, {color: '#64748B'}]}>$ awaiting events…</Text>
        )}
      </ScrollView>
    </View>
  );
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().split('T')[1].replace('Z', '');
}

function formatFields(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: '#0B1020',
    borderWidth: 1,
    borderRadius: 12,
    flex: 1,
    overflow: 'hidden',
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  dot: {width: 11, height: 11, borderRadius: 6, marginRight: 6},
  titleText: {
    color: '#94A3B8',
    fontFamily: 'Cascadia Mono, Consolas, monospace',
    fontSize: 12,
    marginLeft: 8,
  },
  body: {flex: 1, backgroundColor: '#0B1020'},
  line: {
    fontFamily: 'Cascadia Mono, Consolas, monospace',
    fontSize: 12,
    lineHeight: 18,
  },
});
