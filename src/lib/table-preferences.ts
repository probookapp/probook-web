import { z } from "zod";

/**
 * Which columns each person has hidden, list by list.
 *
 * Stored per account (User.tablePreferences, PlatformAdmin.tablePreferences)
 * rather than per browser, so a column hidden at the office stays hidden on the
 * laptop at home. Only the *hidden* keys are kept: a column added to a list
 * later shows up for everyone, instead of being silently missing for whoever
 * saved a preference before it existed.
 */
export type TablePreferences = Record<string, { hidden: string[] }>;

const KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
/** More lists than the app has, so nobody hits it — but the JSON stays bounded. */
const MAX_TABLES = 100;
const MAX_HIDDEN = 64;

export const tablePreferenceUpdateSchema = z.object({
  table: z.string().regex(KEY),
  hidden: z.array(z.string().regex(KEY)).max(MAX_HIDDEN),
});

export type TablePreferenceUpdate = z.infer<typeof tablePreferenceUpdateSchema>;

/** Whatever is in the column, read leniently: a malformed entry is dropped, not fatal. */
export function parseTablePreferences(raw: unknown): TablePreferences {
  const out: TablePreferences = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [table, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!KEY.test(table)) continue;
    const hidden = (value as { hidden?: unknown } | null)?.hidden;
    if (!Array.isArray(hidden)) continue;
    out[table] = {
      hidden: hidden.filter((k): k is string => typeof k === "string" && KEY.test(k)).slice(0, MAX_HIDDEN),
    };
  }
  return out;
}

/** The preferences with one list's entry replaced. An empty list removes the entry. */
export function applyTablePreference(
  prefs: TablePreferences,
  { table, hidden }: TablePreferenceUpdate
): TablePreferences {
  const next = { ...prefs };
  const unique = [...new Set(hidden)];
  if (unique.length === 0) {
    delete next[table];
  } else {
    if (!(table in next) && Object.keys(next).length >= MAX_TABLES) return prefs;
    next[table] = { hidden: unique };
  }
  return next;
}
