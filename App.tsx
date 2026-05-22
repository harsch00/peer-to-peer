/**
 * p2p-mesh root component.
 *
 * The mesh is bootstrapped in `index.js` so handshakes can begin before the
 * UI hydrates. Here we just install the theme provider, gesture handler root,
 * and dispatch to the platform-appropriate shell.
 */
import 'react-native-gesture-handler';
import React, {useEffect} from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {ThemeProvider} from './src/ui/theme/ThemeProvider';
import {RootNavigator} from './src/navigation/RootNavigator';
import {StatusBar, useColorScheme} from 'react-native';
import {useProfileStore} from './src/state/profileStore';
import {usePeersStore} from './src/state/peersStore';
import {usePeerDirectoryStore} from './src/state/peerDirectoryStore';
import {setupMeshLocalNotifications} from './src/notifications/meshLocalNotify';

export default function App() {
  const scheme = useColorScheme() ?? 'dark';
  useEffect(() => {
    useProfileStore
      .getState()
      .hydrate()
      .then(profile => usePeersStore.getState().setIdentity(profile.identity))
      .catch(() => undefined);
    usePeerDirectoryStore
      .getState()
      .hydrate()
      .catch(() => undefined);
    void setupMeshLocalNotifications();
  }, []);

  return (
    <GestureHandlerRootView style={{flex: 1, backgroundColor: 'transparent'}}>
      <SafeAreaProvider style={{backgroundColor: 'transparent'}}>
        <ThemeProvider>
          <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
          <RootNavigator />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
