import { create } from "zustand";

/**
 * One unresolved 409 from the offline queue, keyed by the queue item id.
 * Populated by the sync manager; consumed by ConflictResolutionModal.
 * Conflicts stay here (and in IndexedDB with status "conflict") until the
 * user resolves them — nothing blocks the sync loop while they wait.
 */
export interface QueueConflict {
  /** Unified queue item id. */
  id: string;
  command: string;
  label?: string;
  /** Server payload returned with the 409. */
  serverData: unknown;
}

interface ConflictState {
  conflicts: QueueConflict[];
  addConflict: (conflict: QueueConflict) => void;
  removeConflict: (id: string) => void;
  clearConflicts: () => void;
}

export const useConflictStore = create<ConflictState>((set) => ({
  conflicts: [],
  addConflict: (conflict) =>
    set((state) => ({
      conflicts: [
        ...state.conflicts.filter((c) => c.id !== conflict.id),
        conflict,
      ],
    })),
  removeConflict: (id) =>
    set((state) => ({
      conflicts: state.conflicts.filter((c) => c.id !== id),
    })),
  clearConflicts: () => set({ conflicts: [] }),
}));
