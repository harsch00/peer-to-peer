/**
 * Cross-platform crypto.getRandomValues polyfill.
 *
 *  • Android / iOS: react-native-get-random-values (native).
 *  • Windows:       NativeModules.P2PRandom (Windows.Security.Cryptography).
 *  • Fallback:      Math.random based stub so the app boots even when no
 *                   native source is available; not cryptographically strong.
 */
import {NativeModules, Platform, TurboModuleRegistry} from 'react-native';

type GetRandomValuesFn = <T extends ArrayBufferView | null>(arr: T) => T;

interface MutableGlobal {
  crypto?: {getRandomValues?: GetRandomValuesFn};
}

const root = globalThis as unknown as MutableGlobal;

function ensureCryptoObject() {
  if (!root.crypto) {
    root.crypto = {};
  }
}

function asUint8(arr: ArrayBufferView): Uint8Array {
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

function works(): boolean {
  try {
    const fn = root.crypto?.getRandomValues;
    if (typeof fn !== 'function') return false;
    fn(new Uint8Array(1));
    return true;
  } catch {
    return false;
  }
}

function installJsFallback(): void {
  ensureCryptoObject();
  root.crypto!.getRandomValues = (<T extends ArrayBufferView | null>(arr: T): T => {
    if (arr == null) return arr;
    const u8 = asUint8(arr as ArrayBufferView);
    for (let i = 0; i < u8.length; i++) {
      u8[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }) as GetRandomValuesFn;
}

function installWindowsNative(): boolean {
  const native: any =
    (NativeModules as any).P2PRandom ??
    (NativeModules as any).P3PRandom ??
    TurboModuleRegistry.get('P2PRandom') ??
    TurboModuleRegistry.get('P3PRandom');
  if (!native || typeof native.getRandomBytes !== 'function') {
    return false;
  }
  const atob = (globalThis as any).atob as ((s: string) => string) | undefined;
  if (typeof atob !== 'function') {
    return false;
  }

  ensureCryptoObject();
  root.crypto!.getRandomValues = (<T extends ArrayBufferView | null>(arr: T): T => {
    if (arr == null) return arr;
    const u8 = asUint8(arr as ArrayBufferView);
    if (u8.length === 0) return arr;
    const base64 = native.getRandomBytes(u8.length);
    const binary = atob(base64);
    for (let i = 0; i < u8.length; i++) {
      u8[i] = binary.charCodeAt(i) & 0xff;
    }
    return arr;
  }) as GetRandomValuesFn;

  return works();
}

let provider: 'windows-native' | 'react-native-get-random-values' | 'js-fallback' = 'js-fallback';

if (Platform.OS === 'windows') {
  if (installWindowsNative()) {
    provider = 'windows-native';
  } else {
    installJsFallback();
  }
} else {
  try {
    require('react-native-get-random-values');
    if (works()) provider = 'react-native-get-random-values';
  } catch {
    // Native polyfill missing or broken on this platform — fall through.
  }
  if (!works()) {
    installJsFallback();
  }
}

(globalThis as unknown as {__cryptoPolyfillProvider?: string}).__cryptoPolyfillProvider = provider;
