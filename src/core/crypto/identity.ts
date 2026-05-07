/**
 * Local, account-less cryptographic identity.
 *
 * Identities are generated entirely on-device. There are no emails, phone
 * numbers, or server-side accounts. A peer's "identity" is purely the
 * Curve25519 long-term key pair, plus a short fingerprint derived from it.
 */
import {x25519} from '@noble/curves/ed25519';
import {sha256} from '@noble/hashes/sha256';
import {randomBytes as randBytes} from '@noble/hashes/utils';
import {bytesToHex, hexToBytes} from '@noble/hashes/utils';

export interface PeerIdentity {
  /** Long-term static X25519 private key (32 bytes). */
  privateKey: Uint8Array;
  /** Long-term static X25519 public key (32 bytes). */
  publicKey: Uint8Array;
  /** 8-byte short ID used in mesh packets (first 8 bytes of SHA-256(pub)). */
  peerId: string;
  /** Full hex fingerprint (SHA-256(pub)) — used in QR verification. */
  fingerprint: string;
}

export function generateIdentity(): PeerIdentity {
  const privateKey = randBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);
  return identityFromPrivate(privateKey, publicKey);
}

export function identityFromPrivate(
  privateKey: Uint8Array,
  publicKey?: Uint8Array,
): PeerIdentity {
  const pub = publicKey ?? x25519.getPublicKey(privateKey);
  const digest = sha256(pub);
  return {
    privateKey,
    publicKey: pub,
    peerId: bytesToHex(digest.slice(0, 8)),
    fingerprint: bytesToHex(digest),
  };
}

/** Deterministically derive a short, human-readable nickname from a peer ID. */
export function nicknameFor(peerId: string): string {
  const adjectives = [
    'Quantum', 'Crimson', 'Echo', 'Vivid', 'Onyx', 'Lunar', 'Solar', 'Nova',
    'Cipher', 'Ember', 'Glacier', 'Halcyon', 'Iris', 'Jade', 'Kestrel',
  ];
  const animals = [
    'Falcon', 'Otter', 'Lynx', 'Heron', 'Stag', 'Mantis', 'Koi', 'Wolf',
    'Ibex', 'Fennec', 'Marlin', 'Pangolin', 'Quokka', 'Raven', 'Civet',
  ];
  const a = parseInt(peerId.slice(0, 4), 16) % adjectives.length;
  const b = parseInt(peerId.slice(4, 8), 16) % animals.length;
  const n = parseInt(peerId.slice(8, 12) || '0', 16) % 100;
  return `${adjectives[a]} ${animals[b]}-${n.toString().padStart(2, '0')}`;
}

export const IdentityCodec = {
  toHex(id: PeerIdentity) {
    return {
      sk: bytesToHex(id.privateKey),
      pk: bytesToHex(id.publicKey),
    };
  },
  fromHex(sk: string): PeerIdentity {
    return identityFromPrivate(hexToBytes(sk));
  },
};
