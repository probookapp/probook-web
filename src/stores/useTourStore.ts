import { create } from "zustand";
import type { TourKey } from "@/lib/tours";

type RunnableTour = Exclude<TourKey, "checklist">;

interface TourState {
  /** The tour on screen, if any. One at a time. */
  active: RunnableTour | null;
  start: (tour: RunnableTour) => void;
  stop: () => void;
}

/**
 * Which guided tour is running. A store rather than component state because
 * the button that replays a tour (the sidebar's help button, the till's menu)
 * lives far from the component that draws it.
 */
export const useTourStore = create<TourState>()((set) => ({
  active: null,
  start: (tour) => set({ active: tour }),
  stop: () => set({ active: null }),
}));
