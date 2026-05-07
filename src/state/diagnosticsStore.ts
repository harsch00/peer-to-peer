/**
 * Append-only diagnostic log surfaced in the developer dashboard.
 */
import {create} from 'zustand';
import type {DiagEvent} from '../core/mesh/meshNode';

interface DiagState {
  events: DiagEvent[];
  push: (e: DiagEvent) => void;
  clear: () => void;
}

const MAX = 800;

export const useDiagnosticsStore = create<DiagState>(set => ({
  events: [],
  push: e =>
    set(state => {
      const next = [...state.events, e];
      if (next.length > MAX) next.splice(0, next.length - MAX);
      return {events: next};
    }),
  clear: () => set({events: []}),
}));
