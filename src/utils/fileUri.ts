/**
 * Normalize Windows file paths for <Image source={{uri}}> and other RN loaders.
 * JS may receive `file://C:\\...` from native; RN expects `file:///C:/...`.
 */
export function normalizeLocalFileUri(uri: string): string {
  if (!uri || !uri.toLowerCase().startsWith('file:')) {
    return uri;
  }
  let rest = uri;
  const lower = rest.toLowerCase();
  if (lower.startsWith('file://')) {
    rest = rest.slice('file://'.length);
  } else if (lower.startsWith('file:')) {
    rest = rest.slice('file:'.length);
  }
  rest = rest.replace(/\\/g, '/');
  if (rest.startsWith('/')) {
    return `file://${rest}`;
  }
  if (/^[a-zA-Z]:/.test(rest)) {
    return `file:///${rest}`;
  }
  return `file://${rest.startsWith('//') ? '' : '//'}${rest}`;
}
