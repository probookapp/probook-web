"use client";

import { createContext, useContext, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { adminAuthApi } from "@/lib/admin-api";
import {
  applyTablePreference,
  type TablePreferences,
  type TablePreferenceUpdate,
} from "@/lib/table-preferences";

/**
 * Whose preferences a table reads: the tenant user's, or — inside the admin
 * surface, which has its own accounts and its own session — the platform
 * admin's. AdminLayout provides "admin"; everything else gets the default.
 */
export const TablePreferencesScope = createContext<"user" | "admin">("user");

export interface TableColumn<Row> {
  key: string;
  label: string;
  /** False for the columns a row cannot be recognised without (number, name, actions). */
  hideable?: boolean;
  /**
   * When every row on screen is empty for this column, the column steps aside
   * on its own — a "Labels" column nobody has used yet is only width taken from
   * the columns that have something to say.
   */
  isEmpty?: (row: Row) => boolean;
}

export interface TableColumnsState {
  /** Whether to render the column with this key. */
  show: (key: string) => boolean;
  /** The hideable columns, for the picker. */
  options: { key: string; label: string; visible: boolean; empty: boolean }[];
  toggle: (key: string) => void;
  reset: () => void;
  /** Visible column count — the colSpan of an empty-state row. */
  visibleCount: number;
  hiddenCount: number;
}

function usePreferences() {
  const scope = useContext(TablePreferencesScope);
  const queryClient = useQueryClient();
  const queryKey = ["table-preferences", scope];

  const { data } = useQuery({
    queryKey,
    queryFn: scope === "admin" ? adminAuthApi.getTablePreferences : authApi.getTablePreferences,
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation({
    mutationFn: (input: TablePreferenceUpdate) =>
      scope === "admin" ? adminAuthApi.updateTablePreference(input) : authApi.updateTablePreference(input),
    // Applied before the round trip: a column that takes a second to disappear
    // reads as a click that did not register.
    onMutate: (input) => {
      queryClient.setQueryData<TablePreferences>(queryKey, (prev) => applyTablePreference(prev ?? {}, input));
    },
    onError: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { prefs: data ?? {}, save: mutation.mutate };
}

/**
 * Column visibility for one list: what the user chose to hide (saved to their
 * account), plus the columns that are empty on every row currently shown.
 *
 * `tableKey` names the list in the saved preferences — keep it stable once
 * shipped, or everyone's choice for that list is forgotten.
 */
export function useTableColumns<Row>(
  tableKey: string,
  columns: TableColumn<Row>[],
  rows?: readonly Row[] | null
): TableColumnsState {
  const { prefs, save } = usePreferences();
  const hidden = prefs[tableKey]?.hidden;

  return useMemo(() => {
    const userHidden = new Set(hidden ?? []);
    const hideable = new Set(columns.filter((c) => c.hideable !== false).map((c) => c.key));
    const empty = new Set(
      rows && rows.length > 0
        ? columns.filter((c) => c.isEmpty && rows.every(c.isEmpty)).map((c) => c.key)
        : []
    );

    const show = (key: string) => {
      // A key the list never declared is always shown: forgetting to register a
      // column must not make it vanish.
      if (!hideable.has(key)) return true;
      return !userHidden.has(key) && !empty.has(key);
    };

    const options = columns
      .filter((c) => hideable.has(c.key))
      .map((c) => ({ key: c.key, label: c.label, visible: !userHidden.has(c.key), empty: empty.has(c.key) }));

    const toggle = (key: string) => {
      const next = new Set(userHidden);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      save({ table: tableKey, hidden: [...next] });
    };

    const visibleCount = columns.filter((c) => show(c.key)).length;

    return {
      show,
      options,
      toggle,
      reset: () => save({ table: tableKey, hidden: [] }),
      visibleCount,
      hiddenCount: options.filter((o) => !o.visible).length,
    };
  }, [hidden, columns, rows, save, tableKey]);
}
