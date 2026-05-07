/**
 * Bitchat-style binary packet format.
 *
 *  +--------+--------+--------+--------+
 *  | ver(1) | type(1)| ttl(1) | flg(1) |
 *  +--------+--------+--------+--------+
 *  | timestamp (8, big-endian ms)      |
 *  +-----------------------------------+
 *  | sender peer id (8)                |
 *  +-----------------------------------+
 *  | recipient peer id (8)             | (zeros = broadcast)
 *  +-----------------------------------+
 *  | packet id (16, random)            |
 *  +-----------------------------------+
 *  | payload length (2, big-endian)    |
 *  +-----------------------------------+
 *  | path length (1)                   |
 *  +--------+--------+...
 *  | path[0] (8)     | path[1] (8) ... | (visited peer IDs, for radar)
 *  +-----------------+-----------------+
 *  | payload (encrypted, length above) |
 *  +-----------------------------------+
 *
 * The TTL is an 8-bit field (max 255). Each forwarder decrements TTL by 1
 * and refuses to relay packets with TTL == 0.
 *
 * Packet IDs are 16-byte random nonces; duplicate detection is performed by
 * a Bloom filter on the receive path so the mesh cannot loop indefinitely.
 */
import {bytesToHex, hexToBytes, randomBytes} from '@noble/hashes/utils';

export const PROTOCOL_VERSION = 0x01;
export const DEFAULT_TTL = 7;
export const MAX_PAYLOAD = 60 * 1024; // ~60 KiB hard limit

export const ZERO_PEER = '0000000000000000';

export enum PacketType {
  HANDSHAKE_INIT = 0x01, // Noise XX message 1
  HANDSHAKE_RESP = 0x02, // Noise XX message 2
  HANDSHAKE_FIN = 0x03, // Noise XX message 3
  ENCRYPTED_MSG = 0x10, // application payload, encrypted
  GOSSIP_BROADCAST = 0x20, // public broadcast (un-encrypted, signed)
  PEER_ANNOUNCE = 0x30, // hello / I-am-here
  PEER_GOODBYE = 0x31, // graceful disconnect
  ACK = 0x40, // delivery / read receipt
  PING = 0x50,
  PONG = 0x51,
}

export enum PacketFlag {
  NONE = 0x00,
  REQUIRES_ACK = 0x01,
  IS_RELAYED = 0x02,
  COMPRESSED = 0x04,
  SIGNED = 0x08,
}

export interface MeshPacket {
  version: number;
  type: PacketType;
  ttl: number;
  flags: number;
  timestampMs: number;
  senderId: string; // 8-byte hex
  recipientId: string; // 8-byte hex (ZERO_PEER for broadcast)
  packetId: string; // 16-byte hex
  path: string[]; // already-visited peer IDs (8-byte hex)
  payload: Uint8Array;
}

const HEADER_FIXED = 1 + 1 + 1 + 1 + 8 + 8 + 8 + 16 + 2 + 1;

export function newPacketId(): string {
  return bytesToHex(randomBytes(16));
}

export function createPacket(opts: {
  type: PacketType;
  senderId: string;
  recipientId?: string;
  payload: Uint8Array;
  ttl?: number;
  flags?: number;
  packetId?: string;
}): MeshPacket {
  return {
    version: PROTOCOL_VERSION,
    type: opts.type,
    ttl: opts.ttl ?? DEFAULT_TTL,
    flags: opts.flags ?? PacketFlag.NONE,
    timestampMs: Date.now(),
    senderId: opts.senderId,
    recipientId: opts.recipientId ?? ZERO_PEER,
    packetId: opts.packetId ?? newPacketId(),
    path: [opts.senderId],
    payload: opts.payload,
  };
}

export function encodePacket(p: MeshPacket): Uint8Array {
  if (p.payload.length > MAX_PAYLOAD) {
    throw new Error(`payload too large: ${p.payload.length}`);
  }
  const total = HEADER_FIXED + p.path.length * 8 + p.payload.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  let o = 0;
  out[o++] = p.version;
  out[o++] = p.type;
  out[o++] = p.ttl & 0xff;
  out[o++] = p.flags & 0xff;
  view.setBigUint64(o, BigInt(p.timestampMs), false);
  o += 8;
  out.set(hexToBytes(p.senderId), o);
  o += 8;
  out.set(hexToBytes(p.recipientId), o);
  o += 8;
  out.set(hexToBytes(p.packetId), o);
  o += 16;
  view.setUint16(o, p.payload.length, false);
  o += 2;
  out[o++] = p.path.length & 0xff;
  for (const hop of p.path) {
    out.set(hexToBytes(hop), o);
    o += 8;
  }
  out.set(p.payload, o);
  return out;
}

export function decodePacket(buf: Uint8Array): MeshPacket {
  if (buf.length < HEADER_FIXED) throw new Error('packet too short');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const version = buf[o++];
  const type = buf[o++] as PacketType;
  const ttl = buf[o++];
  const flags = buf[o++];
  const timestampMs = Number(view.getBigUint64(o, false));
  o += 8;
  const senderId = bytesToHex(buf.slice(o, o + 8));
  o += 8;
  const recipientId = bytesToHex(buf.slice(o, o + 8));
  o += 8;
  const packetId = bytesToHex(buf.slice(o, o + 16));
  o += 16;
  const payloadLen = view.getUint16(o, false);
  o += 2;
  const pathLen = buf[o++];
  const path: string[] = [];
  for (let i = 0; i < pathLen; i++) {
    path.push(bytesToHex(buf.slice(o, o + 8)));
    o += 8;
  }
  const payload = buf.slice(o, o + payloadLen);
  if (payload.length !== payloadLen) throw new Error('truncated payload');
  return {
    version,
    type,
    ttl,
    flags,
    timestampMs,
    senderId,
    recipientId,
    packetId,
    path,
    payload,
  };
}

/**
 * Returns a TTL-decremented copy with the relayer's peer ID appended to the
 * path. The caller should refuse to forward if TTL would drop below 1.
 */
export function relayPacket(p: MeshPacket, viaPeerId: string): MeshPacket {
  return {
    ...p,
    ttl: Math.max(0, p.ttl - 1),
    flags: p.flags | PacketFlag.IS_RELAYED,
    path: p.path.includes(viaPeerId) ? p.path : [...p.path, viaPeerId],
  };
}
