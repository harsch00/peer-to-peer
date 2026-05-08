/**
 * Optional local notifications when the app is backgrounded (Android / iOS).
 * Uses Notifee when installed; never throws if the native module is missing.
 */
import {AppState, NativeModules, Platform, TurboModuleRegistry} from 'react-native';

let channelEnsured = false;

type WinNotifier = {
  showToast: (title: string, body: string) => Promise<boolean>;
};

function getWindowsNotifier(): WinNotifier | null {
  const m = NativeModules as {P2PNotifier?: WinNotifier};
  return m.P2PNotifier ?? (TurboModuleRegistry.get('P2PNotifier') as WinNotifier | null);
}

export async function setupMeshLocalNotifications(): Promise<void> {
  if (Platform.OS === 'windows') {
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notifee = require('@notifee/react-native').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {AndroidImportance} = require('@notifee/react-native');
    if (Platform.OS === 'android' && !channelEnsured) {
      await notifee.createChannel({
        id: 'mesh-messages',
        name: 'Mesh messages',
        importance: AndroidImportance.DEFAULT,
      });
      channelEnsured = true;
    }
    if (Platform.OS === 'ios') {
      await notifee.requestPermission();
    }
  } catch {
    /* @notifee/react-native not linked — ignore */
  }
}

export async function notifyMeshMessageForegroundDisabled(title: string, body: string): Promise<void> {
  if (Platform.OS === 'windows') {
    if (AppState.currentState === 'active') {
      return;
    }
    try {
      await getWindowsNotifier()?.showToast(title, body.slice(0, 200));
    } catch {
      // optional
    }
    return;
  }
  if (AppState.currentState === 'active') {
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notifee = require('@notifee/react-native').default;
    await notifee.displayNotification({
      title,
      body: body.slice(0, 200),
      android: {
        channelId: 'mesh-messages',
        pressAction: {id: 'default'},
      },
    });
  } catch {
    /* optional */
  }
}
