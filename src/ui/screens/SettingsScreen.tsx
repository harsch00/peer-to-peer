/**
 * Transport / preference settings.
 */
import React, {useEffect, useState} from 'react';
import {Alert, Platform, ScrollView, StyleSheet, Switch, Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {getAllowNostrGateway, setAllowNostrGateway} from '../../state/meshPrefs';

interface ToggleProps {
  label: string;
  description: string;
  initial?: boolean;
}

function Toggle({label, description, initial = true}: ToggleProps) {
  const theme = useTheme();
  const [v, setV] = useState(initial);
  return (
    <View
      style={[
        styles.toggleRow,
        {
          backgroundColor: theme.platform === 'windows' ? theme.fluent.acrylicCard : theme.colors.surface,
          borderColor: theme.platform === 'windows' ? theme.fluent.glassBorderSubtle : theme.colors.border,
          borderRadius: theme.platform === 'android' ? 24 : 8,
        },
      ]}>
      <View style={{flex: 1, paddingRight: 12}}>
        <Text style={{color: theme.colors.text, fontFamily: theme.fontFamily, fontWeight: '600'}}>
          {label}
        </Text>
        <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamily, fontSize: 12, marginTop: 2}}>
          {description}
        </Text>
      </View>
      <Switch
        value={v}
        onValueChange={setV}
        trackColor={{true: theme.colors.accent, false: theme.colors.surfaceAlt}}
        thumbColor="#fff"
      />
    </View>
  );
}

function NostrGatewayToggle() {
  const theme = useTheme();
  const [v, setV] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initial = await getAllowNostrGateway();
      if (!cancelled) {
        setV(initial);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <View
      style={[
        styles.toggleRow,
        {
          backgroundColor: theme.platform === 'windows' ? theme.fluent.acrylicCard : theme.colors.surface,
          borderColor: theme.platform === 'windows' ? theme.fluent.glassBorderSubtle : theme.colors.border,
          borderRadius: theme.platform === 'android' ? 24 : 8,
        },
      ]}>
      <View style={{flex: 1, paddingRight: 12}}>
        <Text style={{color: theme.colors.text, fontFamily: theme.fontFamily, fontWeight: '600'}}>
          Nostr Internet Relay
        </Text>
        <Text style={{color: theme.colors.textMuted, fontFamily: theme.fontFamily, fontSize: 12, marginTop: 2}}>
          Use public Nostr relays over the internet when no local peers are reachable. Off by default — restart the app
          after changing this.
        </Text>
      </View>
      <Switch
        value={v}
        onValueChange={async next => {
          setV(next);
          await setAllowNostrGateway(next);
          Alert.alert(
            next ? 'Internet gateway enabled' : 'Internet gateway disabled',
            'Fully quit and reopen the app so the mesh stack can use the new transport list.',
          );
        }}
        trackColor={{true: theme.colors.accent, false: theme.colors.surfaceAlt}}
        thumbColor="#fff"
      />
    </View>
  );
}

export function SettingsScreen() {
  const theme = useTheme();
  return (
    <ScrollView contentContainerStyle={{padding: 24, gap: 12}}>
      <Text
        style={{
          fontSize: theme.platform === 'windows' ? 28 : 32,
          fontWeight: '700',
          color: theme.colors.text,
          fontFamily: theme.fontFamily,
        }}>
        Settings
      </Text>

      <Section title="Transports">
        <Toggle
          label="Bluetooth Low Energy"
          description="Discover peers via BLE scanning. Required for offline mesh."
        />
        <Toggle
          label="Wi-Fi Direct"
          description="High-bandwidth peer-to-peer fallback when on the same Wi-Fi P2P group."
        />
        <NostrGatewayToggle />
        <Toggle
          label="Mesh Simulator"
          description="Spawn synthetic peers for development. Disable in production."
          initial
        />
      </Section>

      <Section title="Privacy">
        <Toggle label="Forward gossip from strangers" description="Allow your node to relay packets for unknown peers." />
        <Toggle label="Diagnostics log includes peer IDs" description="Disable to mask peer IDs in the log view." initial={false} />
      </Section>

      <Section title="Performance">
        <Toggle label="60fps animations" description="Use Reanimated worklets for smoother radar/chat motion." />
        <Toggle label="Aggressive Bloom rotation" description="Trade more CPU for tighter dedup memory footprint." initial={false} />
      </Section>
    </ScrollView>
  );
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
  const theme = useTheme();
  return (
    <View style={{gap: 8}}>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontFamily: theme.fontFamilyMono,
          fontSize: 11,
          letterSpacing: 0.6,
          marginTop: 12,
          marginBottom: 4,
        }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
  },
});
