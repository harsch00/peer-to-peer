/**
 * UTF-8 TextEncoder / TextDecoder polyfill plus atob / btoa fallback.
 *
 * Hermes on React Native Windows does not ship these globals, so any code
 * that touches `new TextEncoder()` (chat payloads, Noise AD bytes, Nostr
 * event signing, etc.) blows up at runtime. We install minimal but correct
 * UTF-8 implementations here.
 */

type Mutable = Record<string, unknown>;

const root = globalThis as unknown as Mutable;

function encodeUtf8(input: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + (code - 0xd800) * 0x400 + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

function decodeUtf8(bytes: Uint8Array | ArrayBuffer | null | undefined): string {
  if (!bytes) return '';
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let result = '';
  let i = 0;
  while (i < u8.length) {
    let code = u8[i++];
    if (code >= 0x80) {
      if ((code & 0xe0) === 0xc0) {
        code = ((code & 0x1f) << 6) | (u8[i++] & 0x3f);
      } else if ((code & 0xf0) === 0xe0) {
        code =
          ((code & 0x0f) << 12) |
          ((u8[i++] & 0x3f) << 6) |
          (u8[i++] & 0x3f);
      } else if ((code & 0xf8) === 0xf0) {
        code =
          ((code & 0x07) << 18) |
          ((u8[i++] & 0x3f) << 12) |
          ((u8[i++] & 0x3f) << 6) |
          (u8[i++] & 0x3f);
      }
    }
    if (code > 0xffff) {
      code -= 0x10000;
      result += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      result += String.fromCharCode(code);
    }
  }
  return result;
}

class PolyfillTextEncoder {
  readonly encoding = 'utf-8';
  encode(input: string = ''): Uint8Array {
    return encodeUtf8(String(input));
  }
}

class PolyfillTextDecoder {
  readonly encoding: string;
  constructor(encoding: string = 'utf-8') {
    this.encoding = encoding;
  }
  decode(bytes?: Uint8Array | ArrayBuffer | null): string {
    return decodeUtf8(bytes ?? null);
  }
}

if (typeof root.TextEncoder !== 'function') {
  root.TextEncoder = PolyfillTextEncoder as unknown as Mutable['TextEncoder'];
}

if (typeof root.TextDecoder !== 'function') {
  root.TextDecoder = PolyfillTextDecoder as unknown as Mutable['TextDecoder'];
}

if (typeof root.btoa !== 'function') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  root.btoa = (input: string): string => {
    let output = '';
    let i = 0;
    while (i < input.length) {
      const a = input.charCodeAt(i++) & 0xff;
      const b = i < input.length ? input.charCodeAt(i++) & 0xff : NaN;
      const c = i < input.length ? input.charCodeAt(i++) & 0xff : NaN;
      const t1 = a >> 2;
      const t2 = ((a & 0x3) << 4) | (isNaN(b) ? 0 : b >> 4);
      const t3 = isNaN(b) ? 64 : (((b & 0xf) << 2) | (isNaN(c) ? 0 : c >> 6));
      const t4 = isNaN(c) ? 64 : c & 0x3f;
      output += chars[t1] + chars[t2] + (t3 === 64 ? '=' : chars[t3]) + (t4 === 64 ? '=' : chars[t4]);
    }
    return output;
  };
}

if (typeof root.atob !== 'function') {
  const lookup = new Uint8Array(256);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  root.atob = (input: string): string => {
    const stripped = input.replace(/=+$/, '');
    let output = '';
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < stripped.length; i++) {
      const code = stripped.charCodeAt(i);
      buffer = (buffer << 6) | (lookup[code] ?? 0);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output += String.fromCharCode((buffer >> bits) & 0xff);
      }
    }
    return output;
  };
}
