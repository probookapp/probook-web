import { create } from "zustand";
import type { TourKey } from "@/lib/tours";

type RunnableTour = Exclude<TourKey, "checklist">;

/** "Later" holds for this browser session only: the welcome comes back at the next login. */
const LATER_KEY = "probook-tour-later";

function readPostponed() {
  try {
    return typeof window !== "undefined" && sessionStorage.getItem(LATER_KEY) === "1";
  } catch {
    return false;
  }
}

interface TourState {
  /** The tour on screen, if any. One at a time. */
  active: RunnableTour | null;
  /**
   * The office welcome was put off with "Later" in this browser session. The
   * getting-started checklist reads it too: putting the tour off is not a
   * reason to hide the first steps as well.
   */
  officePostponed: boolean;
  start: (tour: RunnableTour) => void;
  stop: () => void;
  postponeOffice: () => void;
}

/**
 * Which guided tour is running. A store rather than component state because
 * the button that replays a tour (the sidebar's help button, the till's menu)
 * lives far from the component that draws it.
 */
export const useTourStore = create<TourState>()((set) => ({
  active: null,
  officePostponed: readPostponed(),
  start: (tour) => set({ active: tour }),
  stop: () => set({ active: null }),
  postponeOffice: () => {
    try {
      sessionStorage.setItem(LATER_KEY, "1");
    } catch {
      // Private mode: "later" then lasts as long as this page.
    }
    set({ officePostponed: true });
  },
}));
