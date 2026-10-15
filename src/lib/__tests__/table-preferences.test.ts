import { describe, expect, it } from "vitest";
import {
  applyTablePreference,
  parseTablePreferences,
  tablePreferenceUpdateSchema,
} from "../table-preferences";

describe("table preferences", () => {
  it("reads what was saved and drops what is malformed", () => {
    expect(
      parseTablePreferences({
        invoices: { hidden: ["dueDate", 3, "tags"] },
        "bad key!": { hidden: ["x"] },
        quotes: "nope",
        products: { hidden: "nope" },
      })
    ).toEqual({ invoices: { hidden: ["dueDate", "tags"] } });
    expect(parseTablePreferences(null)).toEqual({});
    expect(parseTablePreferences([])).toEqual({});
  });

  it("replaces one list's entry and leaves the others alone", () => {
    const prefs = { invoices: { hidden: ["dueDate"] }, quotes: { hidden: ["tags"] } };
    expect(applyTablePreference(prefs, { table: "invoices", hidden: ["client", "client"] })).toEqual({
      invoices: { hidden: ["client"] },
      quotes: { hidden: ["tags"] },
    });
    // Unchanged input: the cache relies on getting a new object.
    expect(prefs.invoices.hidden).toEqual(["dueDate"]);
  });

  it("forgets a list once nothing in it is hidden", () => {
    expect(applyTablePreference({ invoices: { hidden: ["dueDate"] } }, { table: "invoices", hidden: [] })).toEqual({});
  });

  it("stays bounded", () => {
    const full = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`t${i}`, { hidden: ["a"] }]));
    expect(applyTablePreference(full, { table: "one-more", hidden: ["a"] })).toBe(full);
    expect(applyTablePreference(full, { table: "t5", hidden: ["b"] }).t5).toEqual({ hidden: ["b"] });
    expect(
      tablePreferenceUpdateSchema.safeParse({ table: "invoices", hidden: Array.from({ length: 65 }, (_, i) => `c${i}`) })
        .success
    ).toBe(false);
    expect(tablePreferenceUpdateSchema.safeParse({ table: "../etc", hidden: [] }).success).toBe(false);
  });
});
