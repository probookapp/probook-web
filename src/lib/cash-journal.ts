import { moneyBucket, MONEY_BUCKETS, type MoneyBucket } from "./payment-methods";

/**
 * The cash journal: every sum of money that came in or went out, where it sits
 * (cash, cheques not yet banked, the bank), and what each of those holds.
 *
 * It answers "how much cash do I have?" without the till and without a
 * spreadsheet on the side: client payments and deposits come in, supplier
 * payments and expenses go out, till sales come in for the shops that use it.
 *
 * Balances start from what the business declared it held on the day it began
 * following its money here (CompanySettings.cashJournalStart / opening*).
 * Nothing dated before that day counts: those movements are already inside
 * the declared figures. With no start declared, every movement counts from
 * zero — the page then asks for the opening figures.
 *
 * Moving money between buckets (banking the cash, depositing a cheque) is not
 * recorded anywhere yet, so a cheque stays under "cheques" once received.
 *
 * Kept pure (no database) so the arithmetic is testable on its own; the route
 * (src/app/api/reports/cash-journal) gathers the movements.
 */

export type MovementKind =
  | "invoice_payment"
  | "quote_deposit"
  | "pos_sale"
  | "supplier_payment"
  | "expense";

export interface CashMovement {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  kind: MovementKind;
  /** Signed: positive came in, negative went out. */
  amount: number;
  /** Raw method from whichever vocabulary recorded it. */
  method: string | null;
  /** The document number, or the expense's name. */
  reference: string;
  /** Client, supplier, or — for an expense — who recorded it. */
  party: string | null;
  /** Where the row leads in the app, when it has a page. */
  link: string | null;
}

export interface CashJournalOpening {
  /** YYYY-MM-DD, or null when never declared. */
  start: string | null;
  cash: number;
  cheque: number;
  bank: number;
}

export interface CashJournalRow extends CashMovement {
  /** Null when the method says nothing about where the money is. */
  bucket: MoneyBucket | null;
}

export interface BucketSummary {
  opening: number;
  in: number;
  out: number;
  closing: number;
}

export interface CashJournal {
  /** The declared start day, or null when none was declared. */
  start: string | null;
  /** What was declared held on that day (zeros when nothing was declared). */
  declared: Record<MoneyBucket, number>;
  from: string;
  to: string;
  rows: CashJournalRow[];
  buckets: Record<MoneyBucket, BucketSummary>;
  /** Movements in the period whose method places them nowhere. */
  unclassified: { count: number; total: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildCashJournal(
  opening: CashJournalOpening,
  period: { from: string; to: string },
  movements: CashMovement[]
): CashJournal {
  const counted = movements.filter((m) => !opening.start || m.date >= opening.start);

  const buckets = Object.fromEntries(
    MONEY_BUCKETS.map((b) => [b, { opening: opening[b], in: 0, out: 0, closing: 0 }])
  ) as Record<MoneyBucket, BucketSummary>;

  const rows: CashJournalRow[] = [];
  let unclassifiedCount = 0;
  let unclassifiedTotal = 0;

  for (const m of counted) {
    if (m.date > period.to) continue;
    const bucket = moneyBucket(m.method);
    if (m.date < period.from) {
      // Before the period: folds into the balance the period opens on.
      if (bucket) buckets[bucket].opening += m.amount;
      continue;
    }
    rows.push({ ...m, bucket });
    if (!bucket) {
      unclassifiedCount += 1;
      unclassifiedTotal += m.amount;
      continue;
    }
    if (m.amount >= 0) buckets[bucket].in += m.amount;
    else buckets[bucket].out += -m.amount;
  }

  for (const b of MONEY_BUCKETS) {
    const s = buckets[b];
    s.opening = round2(s.opening);
    s.in = round2(s.in);
    s.out = round2(s.out);
    s.closing = round2(s.opening + s.in - s.out);
  }

  // Oldest first, the way a cash book is read; money in before money out on
  // the same day, so a day never dips below what it actually held.
  rows.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount || a.id.localeCompare(b.id));

  return {
    start: opening.start,
    declared: { cash: opening.cash, cheque: opening.cheque, bank: opening.bank },
    from: period.from,
    to: period.to,
    rows,
    buckets,
    unclassified: { count: unclassifiedCount, total: round2(unclassifiedTotal) },
  };
}
