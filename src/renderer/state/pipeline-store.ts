/**
 * Pipeline store — lightweight zustand store for pipeline tracking status.
 * Receives updates from the main process via IPC and provides state to
 * the PipelineFooter component.
 */

import { create } from 'zustand';
import type { PipelineStatus } from '../../shared/pipeline-types';

interface PipelineState {
  /** Map of pane ID → current pipeline status (null = no active tracking) */
  statuses: Record<string, PipelineStatus | null>;
  /** Set of dismissed pane IDs (user explicitly closed the widget) */
  dismissed: Set<string>;
  /** Update status for a pane (called from IPC listener) */
  setPipelineStatus: (paneId: string, status: PipelineStatus | null) => void;
  /** Dismiss tracking for a pane */
  dismissPipeline: (paneId: string) => void;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  statuses: {},
  dismissed: new Set(),

  setPipelineStatus: (paneId, status) => {
    set((state) => {
      const newStatuses = { ...state.statuses };
      if (status === null) {
        delete newStatuses[paneId];
      } else {
        newStatuses[paneId] = status;
      }
      // Only un-dismiss if this is a genuinely new build (different buildId)
      const newDismissed = new Set(state.dismissed);
      const prev = state.statuses[paneId];
      if (status !== null && (!prev || prev.buildId !== status.buildId)) {
        newDismissed.delete(paneId);
      }
      return { statuses: newStatuses, dismissed: newDismissed };
    });
  },

  dismissPipeline: (paneId) => {
    set((state) => ({
      dismissed: new Set(state.dismissed).add(paneId),
    }));
    // Tell main process to clean up the file
    (window as any).terminalAPI?.dismissPipeline(paneId);
  },
}));

/** Initialize IPC listener — call once from App.tsx */
export function initPipelineIpc(): () => void {
  const api = (window as any).terminalAPI;
  if (!api?.onPipelineStatusUpdate) return () => {};

  return api.onPipelineStatusUpdate((paneId: string, status: unknown) => {
    usePipelineStore.getState().setPipelineStatus(paneId, status as PipelineStatus | null);
  });
}
