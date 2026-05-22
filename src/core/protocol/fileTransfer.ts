/**
 * Chunked file transfer protocol.
 *
 * Large files (images, videos, documents) that exceed the inline attachment
 * limit are split into fixed-size chunks and sent as a sequence of mesh
 * packets. The receiver reassembles and verifies integrity via SHA-256.
 *
 * Flow:
 *   1. Sender  → `file_transfer_header`  (metadata + checksum)
 *   2. Sender  → `file_transfer_chunk` × N
 *   3. Receiver → `file_transfer_complete` (ACK)
 */
import {sha256} from '@noble/hashes/sha256';
import {bytesToHex} from '@noble/hashes/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Each chunk carries at most 16 KiB of base64-encoded file data.
 *  This keeps the encoded mesh packet well within the 60 KiB hard limit
 *  and avoids WebSocket frame size drops on Nostr relays. */
export const CHUNK_SIZE = 16 * 1024;

/** Practical upper bound for a single file transfer (50 MB). */
export const MAX_TRANSFER_SIZE = 50 * 1024 * 1024;

/** Inline path threshold — files smaller than this are sent as inline
 *  `attachment` payloads (instant, no chunking overhead). */
export const INLINE_THRESHOLD = 16 * 1024;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileTransferHeader {
  transferId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  checksum: string; // SHA-256 hex of the full file bytes
  attachmentType: 'image' | 'video' | 'document';
}

export interface FileTransferChunk {
  transferId: string;
  chunkIndex: number;
  data: string; // base64
}

export interface FileTransferComplete {
  transferId: string;
}

export type TransferDirection = 'outbound' | 'inbound';
export type TransferStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface TransferState {
  transferId: string;
  peerId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  attachmentType: 'image' | 'video' | 'document';
  direction: TransferDirection;
  status: TransferStatus;
  totalChunks: number;
  receivedChunks: number;
  progress: number; // 0..1
  error?: string;
  /** URI to the completed file (after reassembly). */
  resultUri?: string;
  /** base64 of full data (for small enough completed transfers). */
  resultBase64?: string;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Compute SHA-256 hex digest for integrity verification. */
export function checksumBytes(data: Uint8Array): string {
  return bytesToHex(sha256(data));
}

/** Split raw bytes into chunk payloads (base64 strings). */
export function splitIntoChunks(data: Uint8Array): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    const slice = data.slice(offset, offset + CHUNK_SIZE);
    chunks.push(bytesToBase64(slice));
  }
  return chunks;
}

/** Reassemble base64 chunks back into a Uint8Array. */
export function reassembleChunks(chunks: string[], totalSize: number): Uint8Array {
  const out = new Uint8Array(totalSize);
  let offset = 0;
  for (const b64 of chunks) {
    const bytes = base64ToBytes(b64);
    out.set(bytes, offset);
    offset += bytes.length;
  }
  return out;
}

export function bytesToBase64(b: Uint8Array): string {
  if (typeof (globalThis as any).btoa === 'function') {
    let bin = '';
    for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return (globalThis as any).btoa(bin);
  }
  return (globalThis as any).Buffer.from(b).toString('base64');
}

export function base64ToBytes(s: string): Uint8Array {
  if (typeof (globalThis as any).atob === 'function') {
    const bin = (globalThis as any).atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array((globalThis as any).Buffer.from(s, 'base64'));
}

/** Generate a short random transfer ID. */
export function newTransferId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytesToHex(bytes);
}
