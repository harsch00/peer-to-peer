import AsyncStorage from '@react-native-async-storage/async-storage';

export const ALLOW_NOSTR_GATEWAY_KEY = 'p2pmesh.allowNostrGateway';

/** Default false: use BLE / Wi‑Fi Direct only unless the user opts in. */
export async function getAllowNostrGateway(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ALLOW_NOSTR_GATEWAY_KEY);
    if (v === null) {
      return false;
    }
    return v === 'true';
  } catch {
    return false;
  }
}

export async function setAllowNostrGateway(allow: boolean): Promise<void> {
  await AsyncStorage.setItem(ALLOW_NOSTR_GATEWAY_KEY, allow ? 'true' : 'false');
}
