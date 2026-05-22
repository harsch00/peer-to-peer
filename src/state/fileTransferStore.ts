/**
 * Zustand store for tracking active file transfers (send and receive).
 */
import {create} from 'zustand';
import type {TransferDirection, TransferState, TransferStatus} from '../core/protocol/fileTransfer';

interface FileTransferStoreState {
  transfers: Record<string, TransferState>;

  /** Register a new transfer (outbound or inbound). */
  startTransfer: (state: TransferState) => void;

  /** Update the progress of an in-flight transfer. */
  updateProgress: (transferId: string, receivedChunks: number) => void;

  /** Mark a transfer as completed with an optional result URI. */
  completeTransfer: (transferId: string, resultUri?: string, resultBase64?: string) => void;

  /** Mark a transfer as failed with an error message. */
  failTransfer: (transferId: string, error: string) => void;

  /** Remove a completed/failed transfer from tracking. */
  dismissTransfer: (transferId: string) => void;
}

export const useFileTransferStore = create<FileTransferStoreState>((set) => ({
  transfers: {},

  startTransfer: (transfer) =>
    set((s) => ({
      transfers: {...s.transfers, [transfer.transferId]: transfer},
    })),

  updateProgress: (transferId, receivedChunks) =>
    set((s) => {
      const t = s.transfers[transferId];
      if (!t) return s;
      const progress = t.totalChunks > 0 ? receivedChunks / t.totalChunks : 0;
      return {
        transfers: {
          ...s.transfers,
          [transferId]: {
            ...t,
            receivedChunks,
            progress: Math.min(1, progress),
            status: 'in_progress' as TransferStatus,
          },
        },
      };
    }),

  completeTransfer: (transferId, resultUri, resultBase64) =>
    set((s) => {
      const t = s.transfers[transferId];
      if (!t) return s;
      return {
        transfers: {
          ...s.transfers,
          [transferId]: {
            ...t,
            status: 'completed' as TransferStatus,
            progress: 1,
            receivedChunks: t.totalChunks,
            resultUri,
            resultBase64,
          },
        },
      };
    }),

  failTransfer: (transferId, error) =>
    set((s) => {
      const t = s.transfers[transferId];
      if (!t) return s;
      return {
        transfers: {
          ...s.transfers,
          [transferId]: {
            ...t,
            status: 'failed' as TransferStatus,
            error,
          },
        },
      };
    }),

  dismissTransfer: (transferId) =>
    set((s) => {
      const next = {...s.transfers};
      delete next[transferId];
      return {transfers: next};
    }),
}));
