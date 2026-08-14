import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  REMINDER_TYPES,
  REMINDER_DOCUMENT_MODULES,
} from "@/app/api/reminders/reminders-shared";

/**
 * Producer and validator must speak the same words.
 *
 * The sweep writes reminder rows directly through Prisma; the reminders API
 * validates against its own whitelist. Nothing connects the two, so a new
 * reminder type added to the sweep would be created happily by the cron job and
 * rejected the moment anyone tried to touch it through the API — and a `switch`
 * or a `Set` that misses simply takes its default branch rather than failing.
 *
 * That silence is exactly what let an earlier mismatch survive: the sweep wrote
 * `payment_overdue` and `invoice` while the dashboard compared against
 * `PAYMENT_DUE` and `INVOICE`, so every reminder fell through to its fallback —
 * an English sentence in the French interface, the word "Document" where
 * "Facture" belonged, and links that went to "#".
 */

const SWEEP = join(__dirname, "..", "reminder-sweep.ts");

/** Literals assigned to a field, e.g. `reminderType: "payment_overdue"`. */
function assigned(source: string, field: string): string[] {
  const re = new RegExp(`${field}\\s*:\\s*"([a-z_]+)"`, "g");
  return [...new Set(Array.from(source.matchAll(re), (m) => m[1]))];
}

describe("reminder vocabulary", () => {
  const sweep = readFileSync(SWEEP, "utf8");

  it("writes at least one reminder type and one document type", () => {
    // Guards the test itself: if the sweep is refactored so these regexes stop
    // matching, the assertions below would pass vacuously.
    expect(assigned(sweep, "reminderType").length).toBeGreaterThan(0);
    expect(assigned(sweep, "documentType").length).toBeGreaterThan(0);
  });

  it("only writes reminder types the API accepts", () => {
    const rejected = assigned(sweep, "reminderType").filter((type) => !REMINDER_TYPES.has(type));
    expect(rejected, "written by the sweep but rejected by the reminders API").toEqual([]);
  });

  it("only writes document types the API can resolve to a permission module", () => {
    const unmapped = assigned(sweep, "documentType").filter(
      (type) => !REMINDER_DOCUMENT_MODULES[type]
    );
    expect(unmapped, "written by the sweep but not mapped to a permission module").toEqual([]);
  });

  it("stores its types lowercase, the way the API compares them", () => {
    const stored = [...assigned(sweep, "reminderType"), ...assigned(sweep, "documentType")];
    expect(stored.filter((v) => v !== v.toLowerCase())).toEqual([]);
  });
});
