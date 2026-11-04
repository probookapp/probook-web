/**
 * Daily, monthly and yearly closures of the secured cash journal
 * (BOI-TVA-DECLA-30-10-30 §170: "une clôture journalière et une clôture
 * mensuelle et annuelle", each storing the period's grand total and the
 * perpetual total).
 *
 * A closure is computed from the journal, never from the rows a screen shows,
 * and is itself appended to the journal as a CLOSURE entry, so it is chained
 * and sealed like a sale. Closures are made for every finished day, month and
 * year that has entries, by the nightly job and whenever the compliance screen
 * or an archive asks; making one twice is refused by the unique key, so the
 * two can race harmlessly.
 *
 * Periods are cut in the business's local time: a sale at 00:30 in Algiers
 * belongs to that day, not to the previous UTC one.
 */
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getFiscalProfile, type FiscalProfileId } from "@/lib/fiscal-profiles";
import { appendJournal, journalAmount, MONEY_KINDS, toNum } from "@/lib/pos-journal";

export const PROFILE_TIMEZONES: Record<FiscalProfileId, string> = {
  DZ: "Africa/Algiers",
  FR: "Europe/Paris",
};

export type PeriodType = "DAY" | "MONTH" | "YEAR";

/** "2026-11-03" for an instant, in a time zone. */
export function localDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export interface ClosureBreakdown {
  byKind: Record<string, string>;
  byMethod: Record<string, string>;
  vatByRate: Record<string, { ht: string; vat: string }>;
}

interface MoneyEntry {
  sequence: number;
  kind: string;
  amount: unknown;
  occurredAt: Date;
  payload: unknown;
}

/** Totals of a run of money entries. */
export function aggregateEntries(entries: MoneyEntry[]) {
  const byKind: Record<string, number> = {};
  const byMethod: Record<string, number> = {};
  const vat: Record<string, { ht: number; vat: number }> = {};
  let total = 0;
  for (const e of entries) {
    const amount = toNum(e.amount);
    total += amount;
    byKind[e.kind] = (byKind[e.kind] ?? 0) + amount;
    const payload = (e.payload ?? {}) as {
      payments?: Array<{ method: string; amount: string }>;
      lines?: Array<{ vatRate: number; ht: string; vat: string }>;
    };
    for (const p of payload.payments ?? []) {
      byMethod[p.method] = (byMethod[p.method] ?? 0) + toNum(p.amount);
    }
    for (const l of payload.lines ?? []) {
      const key = String(l.vatRate);
      vat[key] ??= { ht: 0, vat: 0 };
      vat[key].ht += toNum(l.ht);
      vat[key].vat += toNum(l.vat);
    }
  }
  const fmt = (r: Record<string, number>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, journalAmount(v)]));
  const breakdown: ClosureBreakdown = {
    byKind: fmt(byKind),
    byMethod: fmt(byMethod),
    vatByRate: Object.fromEntries(
      Object.entries(vat).map(([k, v]) => [k, { ht: journalAmount(v.ht), vat: journalAmount(v.vat) }])
    ),
  };
  return {
    count: entries.length,
    total,
    firstSequence: entries.length ? entries[0].sequence : null,
    lastSequence: entries.length ? entries[entries.length - 1].sequence : null,
    breakdown,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function tenantTimeZone(tenantId: string): Promise<string> {
  const settings = await prisma.companySettings.findFirst({
    where: { tenantId },
    select: { fiscalProfile: true },
  });
  return PROFILE_TIMEZONES[getFiscalProfile(settings?.fiscalProfile).id];
}

/** Write one closure and its CLOSURE journal entry, atomically. */
async function writeClosure(
  tenantId: string,
  periodType: PeriodType,
  periodKey: string,
  agg: ReturnType<typeof aggregateEntries>,
  grandTotalPeriod: number,
  perpetualTotal: number
): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      const payload = {
        periodType,
        periodKey,
        entryCount: agg.count,
        firstSequence: agg.firstSequence,
        lastSequence: agg.lastSequence,
        totalTtc: journalAmount(agg.total),
        breakdown: agg.breakdown,
        grandTotalPeriod: journalAmount(grandTotalPeriod),
        perpetualTotal: journalAmount(perpetualTotal),
      };
      const entry = await appendJournal(tx, { tenantId, kind: "CLOSURE", payload });
      await tx.posClosure.create({
        data: {
          tenantId,
          periodType,
          periodKey,
          firstSequence: agg.firstSequence,
          lastSequence: agg.lastSequence,
          entryCount: agg.count,
          totalTtc: journalAmount(agg.total),
          breakdown: agg.breakdown as unknown as Prisma.InputJsonValue,
          grandTotalPeriod: journalAmount(grandTotalPeriod),
          perpetualTotal: journalAmount(perpetualTotal),
          journalSequence: entry.sequence,
          hash: entry.hash,
        },
      });
    });
    return true;
  } catch (err) {
    // Another run closed this period first.
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

/**
 * Close every finished day, then month, then year that has journal entries
 * and no closure yet. Returns how many closures were written.
 */
export async function closePendingPeriods(tenantId: string, now: Date = new Date()): Promise<number> {
  const timeZone = await tenantTimeZone(tenantId);
  const today = localDay(now, timeZone);
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);
  let written = 0;

  // ── Days ────────────────────────────────────────────────────────────────
  const lastDay = await prisma.posClosure.findFirst({
    where: { tenantId, periodType: "DAY" },
    orderBy: { journalSequence: "desc" },
    select: { lastSequence: true, perpetualTotal: true },
  });
  const pending = await prisma.posJournalEntry.findMany({
    where: {
      tenantId,
      kind: { in: [...MONEY_KINDS] },
      sequence: { gt: lastDay?.lastSequence ?? 0 },
    },
    orderBy: { sequence: "asc" },
    select: { sequence: true, kind: true, amount: true, occurredAt: true, payload: true },
  });
  const byDay = new Map<string, MoneyEntry[]>();
  for (const e of pending) {
    const day = localDay(e.occurredAt, timeZone);
    if (day >= today) break; // today is still open; so is everything after it
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }
  let perpetual = toNum(lastDay?.perpetualTotal);
  for (const [day, entries] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const agg = aggregateEntries(entries);
    perpetual += agg.total;
    const earlierThisYear = await prisma.posClosure.aggregate({
      where: { tenantId, periodType: "DAY", periodKey: { startsWith: day.slice(0, 4), lt: day } },
      _sum: { totalTtc: true },
    });
    const ytd = toNum(earlierThisYear._sum.totalTtc) + agg.total;
    if (await writeClosure(tenantId, "DAY", day, agg, ytd, perpetual)) written++;
  }

  // ── Months and years, from the days ─────────────────────────────────────
  for (const [type, keyLength, current] of [
    ["MONTH", 7, thisMonth],
    ["YEAR", 4, thisYear],
  ] as const) {
    const days = await prisma.posClosure.findMany({
      where: { tenantId, periodType: "DAY" },
      orderBy: { periodKey: "asc" },
      select: { periodKey: true, firstSequence: true, lastSequence: true, perpetualTotal: true },
    });
    const done = new Set(
      (
        await prisma.posClosure.findMany({
          where: { tenantId, periodType: type },
          select: { periodKey: true },
        })
      ).map((c) => c.periodKey)
    );
    const periods = new Map<string, typeof days>();
    for (const d of days) {
      const key = d.periodKey.slice(0, keyLength);
      if (key >= current || done.has(key)) continue;
      if (!periods.has(key)) periods.set(key, []);
      periods.get(key)!.push(d);
    }
    for (const [key, members] of periods) {
      const first = members[0].firstSequence ?? 0;
      const last = members[members.length - 1].lastSequence ?? 0;
      const entries = await prisma.posJournalEntry.findMany({
        where: { tenantId, kind: { in: [...MONEY_KINDS] }, sequence: { gte: first, lte: last } },
        orderBy: { sequence: "asc" },
        select: { sequence: true, kind: true, amount: true, occurredAt: true, payload: true },
      });
      const agg = aggregateEntries(entries);
      const yearDays = await prisma.posClosure.aggregate({
        where: {
          tenantId,
          periodType: "DAY",
          periodKey: { startsWith: key.slice(0, 4), lte: members[members.length - 1].periodKey },
        },
        _sum: { totalTtc: true },
      });
      const perpetualAtEnd = toNum(members[members.length - 1].perpetualTotal);
      if (await writeClosure(tenantId, type, key, agg, toNum(yearDays._sum.totalTtc), perpetualAtEnd)) {
        written++;
      }
    }
  }
  return written;
}
