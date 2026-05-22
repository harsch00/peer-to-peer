/**
 * FileTransferManager — orchestrates chunked file transfers.
 *
 * Outbound: reads file bytes, splits into chunks, sends header + chunks via
 * the mesh node's sendChatPayload / sendBroadcastPayload methods.
 *
 * Inbound: receives header → allocates buffer → collects chunks → verifies
 * checksum → surfaces completed attachment to UI as a synthetic ChatMessage.
 */
import type {ChatPayload} from '../protocol/messageEnvelope';
import {
  CHUNK_SIZE,
  MAX_TRANSFER_SIZE,
  base64ToBytes,
  bytesToBase64,
  checksumBytes,
  newTransferId,
  splitIntoChunks,
  reassembleChunks,
} from '../protocol/fileTransfer';
import type {TransferStatus} from '../protocol/fileTransfer';
import {useFileTransferStore} from '../../state/fileTransferStore';

// ---------------------------------------------------------------------------
// Inbound reassembly state (not persisted — lives in memory only)
// ---------------------------------------------------------------------------

interface InboundTransfer {
  transferId: string;
  peerId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  attachmentType: 'image' | 'video' | 'document';
  totalChunks: number;
  checksum: string;
  chunks: (string | null)[]; // indexed by chunkIndex, null = not yet received
  receivedCount: number;
}

const inboundTransfers = new Map<string, InboundTransfer>();

// ---------------------------------------------------------------------------
// Outbound: send a large file as chunked transfer
// ---------------------------------------------------------------------------

export interface SendFileOpts {
  toPeerId: string;
  fileBytes: Uint8Array;
  fileName: string;
  mimeType: string;
  attachmentType: 'image' | 'video' | 'document';
  /** Callback to send a payload over the mesh (provided by MeshNode). */
  sendPayload: (toPeerId: string, payload: ChatPayload) => Promise<void>;
  /** If sending to broadcast channel. */
  isBroadcast?: boolean;
  sendBroadcastPayload?: (payload: ChatPayload) => Promise<void>;
}

export async function sendFileChunked(opts: SendFileOpts): Promise<string> {
  const {fileBytes, fileName, mimeType, attachmentType, toPeerId} = opts;

  if (fileBytes.byteLength > MAX_TRANSFER_SIZE) {
    throw new Error(`File too large (${(fileBytes.byteLength / (1024 * 1024)).toFixed(1)} MB). Maximum is ${MAX_TRANSFER_SIZE / (1024 * 1024)} MB.`);
  }

  const transferId = newTransferId();
  const checksum = checksumBytes(fileBytes);
  const chunks = splitIntoChunks(fileBytes);
  const totalChunks = chunks.length;

  // Register in store
  useFileTransferStore.getState().startTransfer({
    transferId,
    peerId: toPeerId,
    fileName,
    fileSize: fileBytes.byteLength,
    mimeType,
    attachmentType,
    direction: 'outbound',
    status: 'in_progress',
    totalChunks,
    receivedChunks: 0,
    progress: 0,
  });

  const send = opts.isBroadcast && opts.sendBroadcastPayload
    ? (payload: ChatPayload) => opts.sendBroadcastPayload!(payload)
    : (payload: ChatPayload) => opts.sendPayload(toPeerId, payload);

  try {
    // 1. Send header
    await send({
      kind: 'file_transfer_header',
      transferId,
      fileName,
      fileSize: fileBytes.byteLength,
      mimeType,
      totalChunks,
      checksum,
      attachmentType,
    });

    // 2. Send chunks sequentially
    for (let i = 0; i < chunks.length; i++) {
      await send({
        kind: 'file_transfer_chunk',
        transferId,
        chunkIndex: i,
        data: chunks[i],
      });
      useFileTransferStore.getState().updateProgress(transferId, i + 1);

      // Yield more frequently and for longer to prevent WebSocket / Bridge flooding
      if (i % 2 === 1) {
        await new Promise<void>(r => setTimeout(r, 25));
      }
    }

    useFileTransferStore.getState().completeTransfer(transferId);
    return transferId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    useFileTransferStore.getState().failTransfer(transferId, msg);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Inbound: receive header + chunks, reassemble
// ---------------------------------------------------------------------------

export function handleInboundHeader(
  fromPeerId: string,
  payload: Extract<ChatPayload, {kind: 'file_transfer_header'}>,
): void {
  const {transferId, fileName, fileSize, mimeType, totalChunks, checksum, attachmentType} = payload;

  // Guard against absurdly large transfers
  if (fileSize > MAX_TRANSFER_SIZE) {
    useFileTransferStore.getState().startTransfer({
      transferId,
      peerId: fromPeerId,
      fileName,
      fileSize,
      mimeType: mimeType ?? 'application/octet-stream',
      attachmentType,
      direction: 'inbound',
      status: 'failed',
      totalChunks,
      receivedChunks: 0,
      progress: 0,
      error: 'File too large',
    });
    return;
  }

  const transfer: InboundTransfer = {
    transferId,
    peerId: fromPeerId,
    fileName,
    fileSize,
    mimeType: mimeType ?? 'application/octet-stream',
    attachmentType,
    totalChunks,
    checksum,
    chunks: new Array(totalChunks).fill(null),
    receivedCount: 0,
  };
  inboundTransfers.set(transferId, transfer);

  useFileTransferStore.getState().startTransfer({
    transferId,
    peerId: fromPeerId,
    fileName,
    fileSize,
    mimeType: transfer.mimeType,
    attachmentType,
    direction: 'inbound',
    status: 'in_progress',
    totalChunks,
    receivedChunks: 0,
    progress: 0,
  });
}

export interface ChunkResult {
  complete: boolean;
  /** If complete, the reassembled file as base64. */
  base64?: string;
  mimeType?: string;
  fileName?: string;
  attachmentType?: 'image' | 'video' | 'document';
  transferId: string;
}

export function handleInboundChunk(
  payload: Extract<ChatPayload, {kind: 'file_transfer_chunk'}>,
): ChunkResult {
  const {transferId, chunkIndex, data} = payload;
  const transfer = inboundTransfers.get(transferId);

  if (!transfer) {
    // Chunk arrived before header or after completion — ignore
    return {complete: false, transferId};
  }

  if (chunkIndex < 0 || chunkIndex >= transfer.totalChunks) {
    return {complete: false, transferId};
  }

  // Avoid double-counting
  if (transfer.chunks[chunkIndex] === null) {
    transfer.chunks[chunkIndex] = data;
    transfer.receivedCount++;
  }

  useFileTransferStore.getState().updateProgress(transferId, transfer.receivedCount);

  // Check if all chunks received
  if (transfer.receivedCount >= transfer.totalChunks) {
    // Reassemble
    const allChunks = transfer.chunks as string[];
    const assembled = reassembleChunks(allChunks, transfer.fileSize);

    // Verify checksum
    const actualChecksum = checksumBytes(assembled);
    if (actualChecksum !== transfer.checksum) {
      useFileTransferStore.getState().failTransfer(transferId, 'Checksum mismatch');
      inboundTransfers.delete(transferId);
      return {complete: false, transferId};
    }

    const resultBase64 = bytesToBase64(assembled);
    useFileTransferStore.getState().completeTransfer(transferId, undefined, resultBase64);
    inboundTransfers.delete(transferId);

    return {
      complete: true,
      base64: resultBase64,
      mimeType: transfer.mimeType,
      fileName: transfer.fileName,
      attachmentType: transfer.attachmentType,
      transferId,
    };
  }

  return {complete: false, transferId};
}

/** Check if a transfer ID has an active inbound state. */
export function hasActiveInboundTransfer(transferId: string): boolean {
  return inboundTransfers.has(transferId);
}

/** Clean up a timed-out or abandoned transfer. */
export function abandonTransfer(transferId: string): void {
  inboundTransfers.delete(transferId);
  useFileTransferStore.getState().failTransfer(transferId, 'Abandoned');
}
