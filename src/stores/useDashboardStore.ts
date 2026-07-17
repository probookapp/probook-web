import { create } from "zustand";

/**
 * Canonical list of dashboard stat-card identifiers, in their default order.
 * Kept in sync with the cards rendered by DashboardPage.
 */
export const DASHBOARD_STAT_IDS = [
  "clients",
  "quotes",
  "invoices",
  "monthlyRevenue",
  "yearlyRevenue",
  "pending",
  "totalExpenses",
  "profit",
] as const;

export type DashboardStatId = (typeof DASHBOARD_STAT_IDS)[number];

interface DashboardLayoutState {
  /** Ordered list of stat ids (both visible and hidden). */
  order: DashboardStatId[];
  /** Ids that are hidden from the dashboard. */
  hidden: DashboardStatId[];
  toggle: (id: DashboardStatId) => void;
  moveUp: (id: DashboardStatId) => void;
  moveDown: (id: DashboardStatId) => void;
  reset: () => void;
  /** Load a layout from an external source (e.g. server) without re-persisting to it. */
  hydrate: (layout: { order?: string[]; hidden?: string[] }) => void;
}

const STORAGE_KEY = "probook_dashboard_layout";

const isValidId = (id: string): id is DashboardStatId =>
  (DASHBOARD_STAT_IDS as readonly string[]).includes(id);

/** Merge persisted state with the canonical list so newly-added cards appear. */
function loadPersisted(): { order: DashboardStatId[]; hidden: DashboardStatId[] } {
  const fallback = { order: [...DASHBOARD_STAT_IDS], hidden: [] as DashboardStatId[] };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { order?: string[]; hidden?: string[] };
    const storedOrder = (parsed.order ?? []).filter(isValidId);
    // Append any ids missing from persisted order (e.g. new cards).
    const order = [
      ...storedOrder,
      ...DASHBOARD_STAT_IDS.filter((id) => !storedOrder.includes(id)),
    ];
    const hidden = (parsed.hidden ?? []).filter(isValidId);
    return { order, hidden };
  } catch {
    return fallback;
  }
}

function persist(state: { order: DashboardStatId[]; hidden: DashboardStatId[] }) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ order: state.order, hidden: state.hidden })
    );
  } catch {
    // ignore quota / privacy-mode errors
  }
}

const initial = loadPersisted();

export const useDashboardStore = create<DashboardLayoutState>()((set, get) => ({
  order: initial.order,
  hidden: initial.hidden,

  toggle: (id) => {
    const hidden = get().hidden.includes(id)
      ? get().hidden.filter((h) => h !== id)
      : [...get().hidden, id];
    set({ hidden });
    persist({ order: get().order, hidden });
  },

  moveUp: (id) => {
    const order = [...get().order];
    const i = order.indexOf(id);
    if (i > 0) {
      [order[i - 1], order[i]] = [order[i], order[i - 1]];
      set({ order });
      persist({ order, hidden: get().hidden });
    }
  },

  moveDown: (id) => {
    const order = [...get().order];
    const i = order.indexOf(id);
    if (i >= 0 && i < order.length - 1) {
      [order[i + 1], order[i]] = [order[i], order[i + 1]];
      set({ order });
      persist({ order, hidden: get().hidden });
    }
  },

  reset: () => {
    const order = [...DASHBOARD_STAT_IDS];
    const hidden: DashboardStatId[] = [];
    set({ order, hidden });
    persist({ order, hidden });
  },

  hydrate: (layout) => {
    const storedOrder = (layout.order ?? []).filter(isValidId);
    const order = [
      ...storedOrder,
      ...DASHBOARD_STAT_IDS.filter((id) => !storedOrder.includes(id)),
    ];
    const hidden = (layout.hidden ?? []).filter(isValidId);
    set({ order, hidden });
    persist({ order, hidden });
  },
}));
