import {Alert, NativeModules, Platform, TurboModuleRegistry} from 'react-native';
import {normalizeLocalFileUri} from './fileUri';

export type PickedFile = {
  uri: string;
  name: string;
  sizeBytes?: number;
  mimeType?: string;
};

type NativePickRow = {
  uri: string;
  name?: string | null;
  fileCopyUri?: string | null;
  type?: string | null;
  size?: number | null;
  copyError?: string;
};

type RNDocumentPickerNative = {
  pick: (opts: Record<string, unknown>) => Promise<NativePickRow[]>;
};

type NativeWinPicker = {
  pickFileAsync: (opts: {kind: string}) => Promise<{
    uri?: string;
    name?: string;
    sizeBytes?: number;
    mimeType?: string;
  }>;
};

function getRNDocumentPicker(): RNDocumentPickerNative | null {
  try {
    const fromRegistry = TurboModuleRegistry.get('RNDocumentPicker') as RNDocumentPickerNative | null | undefined;
    if (fromRegistry && typeof fromRegistry.pick === 'function') {
      return fromRegistry;
    }
  } catch {
    // ignore
  }
  const fromBridge = (NativeModules as {RNDocumentPicker?: RNDocumentPickerNative}).RNDocumentPicker;
  if (fromBridge && typeof fromBridge.pick === 'function') {
    return fromBridge;
  }
  return null;
}

function isPickerCancel(code: string | undefined): boolean {
  return (
    code === 'DOCUMENT_PICKER_CANCELED' ||
    code === 'E_DOCUMENT_PICKER_CANCELED' ||
    code === 'UNKNOWN_ACTIVITY_RESULT'
  );
}

async function pickWithRNDocumentPicker(kind: 'image' | 'video' | 'document'): Promise<PickedFile | null> {
  const n = getRNDocumentPicker();
  if (!n) {
    Alert.alert(
      'File picker',
      'Native module RNDocumentPicker is missing. Rebuild the app. On Android: cd android && .\\gradlew clean && cd .. && npx react-native run-android.',
    );
    return null;
  }
  const typeArr =
    Platform.OS === 'ios'
      ? kind === 'image'
        ? ['public.image']
        : kind === 'video'
          ? ['public.movie']
          : ['public.item']
      : [kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : '*/*'];
  try {
    const results = await n.pick({
      allowMultiSelection: false,
      type: typeArr,
      mode: 'import',
      copyTo: 'cachesDirectory',
      presentationStyle: 'formSheet',
      transitionStyle: 'coverVertical',
    });
    const file = results?.[0];
    if (!file) {
      return null;
    }
    return {
      uri: normalizeLocalFileUri((file.fileCopyUri || file.uri) as string),
      name: file.name ?? 'file',
      sizeBytes: file.size ?? undefined,
      mimeType: file.type ?? undefined,
    };
  } catch (e: unknown) {
    const err = e as {code?: string; message?: string};
    if (isPickerCancel(err?.code)) {
      return null;
    }
    Alert.alert('Attachment', err?.message ?? 'Could not read file');
    return null;
  }
}

function getWindowsNativeFilePicker(): NativeWinPicker | undefined {
  const m = NativeModules as {P2PFilePicker?: NativeWinPicker; P3PFilePicker?: NativeWinPicker};
  return (
    m.P2PFilePicker ??
    m.P3PFilePicker ??
    (TurboModuleRegistry.get('P2PFilePicker') as NativeWinPicker | undefined) ??
    (TurboModuleRegistry.get('P3PFilePicker') as NativeWinPicker | undefined)
  );
}

async function pickWithWindowsNative(kind: 'image' | 'video' | 'document'): Promise<PickedFile | null> {
  const NativeFile = getWindowsNativeFilePicker();
  if (!NativeFile?.pickFileAsync) {
    Alert.alert(
      'File picker',
      'P2PFilePicker is not in this Windows build. Rebuild the app (npm run windows) so P2PFilePickerModule is compiled.',
    );
    return null;
  }
  try {
    const res = await NativeFile.pickFileAsync({kind});
    if (!res?.uri) {
      return null;
    }
    return {
      uri: normalizeLocalFileUri(res.uri),
      name: res.name ?? 'file',
      sizeBytes: res.sizeBytes ?? undefined,
      mimeType: res.mimeType ?? undefined,
    };
  } catch {
    Alert.alert('File picker', 'Could not open a file.');
    return null;
  }
}

export async function pickAttachment(kind: 'image' | 'video' | 'document'): Promise<PickedFile | null> {
  if (Platform.OS === 'windows') {
    if (getWindowsNativeFilePicker()?.pickFileAsync) {
      return pickWithWindowsNative(kind);
    }
    return pickWithRNDocumentPicker(kind);
  }

  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    return pickWithRNDocumentPicker(kind);
  }

  Alert.alert('File picker', 'Attachments are not supported on this platform.');
  return null;
}
