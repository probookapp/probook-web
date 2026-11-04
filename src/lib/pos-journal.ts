/**
 * The secured cash journal, French art. 286 I 3° bis CGI (BOI-TVA-DECLA-30-10-30).
 *
 * Four conditions, and where each one lives:
 *
 * - Inaltérabilité: every customer payment the software records is written
 *   here when it happens, inside the same database transaction. A correction
 *   (a cancelled ticket, a refund, a deleted invoice payment) is a new "moins"
 *   entry; the original is never touched. A trigger refuses UPDATE and DELETE
 *   on the table (migration 20261104_pos_secured_journal).
 * - Sécurisation: entries form a chain per tenant, sequence 1, 2, 3… with each
 *   entry's HMAC-SHA256 covering its content and the previous entry's hash.
 *   Removing, inserting or altering any entry breaks every hash after it, and
 *   `verifyChain` says where.
 * - Conservation: daily, monthly and yearly closures with the period's grand
 *   total and the perpetual total (src/lib/pos-closures.ts), themselves sealed
 *   as CLOSURE entries of this chain. Rows are kept online indefinitely.
 * - Archivage: an archive of a closed period, in an open format (JSON) with a
 *   notice in French and its own signature, whose generation is itself
 *   journaled (src/lib/pos-archive.ts).
 *
 * The journal is self-contained: each payload holds the data as recorded
 * (lines, totals, payment methods, operator, register), so it stays readable
 * whatever later happens to the rows a screen shows.
 */
import { createHmac } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The software and version an attestation covers. Bump the major version
 * whenever a change touches what this file, pos-closures.ts or pos-archive.ts
 * guarantee: a new major version needs a new attestation (BOFiP §380).
 */
export const FISCAL_SOFTWARE = {
  name: "Probook",
  majorVersion: "1",
  version: "1.0",
} as const;

export const JOURNAL_KINDS = [
  "SALE",
  "CANCELLATION",
  "REFUND",
  "PAYMENT",
  "PAYMENT_REVERSAL",
  "CLOSURE",
  "ARCHIVE",
] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

/** Kinds that move money, and so count toward closures. */
export const MONEY_KINDS: readonly JournalKind[] = [
  "SALE",
  "CANCELLATION",
  "REFUND",
  "PAYMENT",
  "PAYMENT_REVERSAL",
];

/** The previous hash of the first entry of every chain. */
export const GENESIS_HASH = "0".repeat(64);

const HASH_PREFIX = "j1:";

function journalSecret(): string {
  const secret =
    process.env.POS_JOURNAL_SECRET ??
    process.env.INVOICE_INTEGRITY_SECRET ??
    process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("POS_JOURNAL_SECRET (or INVOICE_INTEGRITY_SECRET / JWT_SECRET) must be set");
  }
  return secret;
}

/** JSON with keys sorted at every level: one value, one string, always. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

/** A number out of whatever holds one: a Prisma Decimal, a string, a number. */
export function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value) || 0;
}

/** Money as the journal writes it: three decimals, the precision of the columns. */
export function journalAmount(value: unknown): string {
  // + 0 turns a -0 into 0, so "moins" of nothing does not print "-0.000".
  return (Math.round(toNum(value) * 1000) / 1000 + 0).toFixed(3);
}

export interface EntryContent {
  tenantId: string;
  sequence: number;
  kind: string;
  referenceId: string | null;
  amount: string;
  occurredAt: string;
  payload: unknown;
  previousHash: string;
}

export function computeEntryHash(entry: EntryContent): string {
  const material = canonicalJson({
    tenantId: entry.tenantId,
    sequence: entry.sequence,
    kind: entry.kind,
    referenceId: entry.referenceId,
    amount: entry.amount,
    occurredAt: entry.occurredAt,
    payload: entry.payload,
    previousHash: entry.previousHash,
  });
  return HASH_PREFIX + createHmac("sha256", journalSecret()).update(material).digest("hex");
}

/** A signature over any document (an archive), with the journal's key. */
export function signDocument(content: unknown): string {
  return HASH_PREFIX + createHmac("sha256", journalSecret()).update(canonicalJson(content)).digest("hex");
}

export interface AppendInput {
  tenantId: string;
  kind: JournalKind;
  referenceId?: string | null;
  /** Signed, taxes included. 0 for CLOSURE and ARCHIVE. */
  amount?: number;
  occurredAt?: Date;
  payload: Record<string, unknown>;
}

/**
 * Append one entry. Must run inside the transaction that records the event,
 * so the event and its seal commit or fail together. A per-tenant advisory
 * lock serialises appends, so two sales never claim the same sequence.
 */
export async function appendJournal(tx: Prisma.TransactionClient, input: AppendInput) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-journal:${input.tenantId}`}))`;
  const last = await tx.posJournalEntry.findFirst({
    where: { tenantId: input.tenantId },
    orderBy: { sequence: "desc" },
    select: { sequence: true, hash: true },
  });
  const sequence = (last?.sequence ?? 0) + 1;
  const previousHash = last?.hash ?? GENESIS_HASH;
  // Millisecond precision: what the timestamp(3) column stores, so the hash
  // recomputed from the row matches the one computed here.
  const occurredAt = new Date(Math.floor((input.occurredAt ?? new Date()).getTime()));
  // Through JSON once, so the hashed payload is exactly what JSONB will return.
  const payload = JSON.parse(JSON.stringify(input.payload)) as Record<string, unknown>;
  const amount = journalAmount(input.amount ?? 0);
  const hash = computeEntryHash({
    tenantId: input.tenantId,
    sequence,
    kind: input.kind,
    referenceId: input.referenceId ?? null,
    amount,
    occurredAt: occurredAt.toISOString(),
    payload,
    previousHash,
  });
  return tx.posJournalEntry.create({
    data: {
      tenantId: input.tenantId,
      sequence,
      kind: input.kind,
      referenceId: input.referenceId ?? null,
      amount,
      occurredAt,
      payload: payload as Prisma.InputJsonValue,
      previousHash,
      hash,
    },
  });
}

export interface StoredEntry {
  tenantId: string;
  sequence: number;
  kind: string;
  referenceId: string | null;
  amount: unknown;
  occurredAt: Date;
  payload: unknown;
  previousHash: string;
  hash: string;
}

export type ChainVerdict =
  | { ok: true; checked: number; lastHash: string }
  | { ok: false; checked: number; brokenAt: number; reason: "gap" | "link" | "hash" };

/**
 * Re-walk a run of consecutive entries. `expectedPrevious` is the hash the
 * first one must point at (GENESIS_HASH for a chain that starts at 1).
 */
export function verifyChain(
  entries: StoredEntry[],
  expectedPrevious: string = GENESIS_HASH,
  expectedFirstSequence = 1
): ChainVerdict {
  let previous = expectedPrevious;
  let nextSequence = expectedFirstSequence;
  let checked = 0;
  for (const e of entries) {
    if (e.sequence !== nextSequence) return { ok: false, checked, brokenAt: nextSequence, reason: "gap" };
    if (e.previousHash !== previous) return { ok: false, checked, brokenAt: e.sequence, reason: "link" };
    const recomputed = computeEntryHash({
      tenantId: e.tenantId,
      sequence: e.sequence,
      kind: e.kind,
      referenceId: e.referenceId,
      amount: journalAmount(e.amount),
      occurredAt: e.occurredAt.toISOString(),
      payload: e.payload,
      previousHash: e.previousHash,
    });
    if (recomputed !== e.hash) return { ok: false, checked, brokenAt: e.sequence, reason: "hash" };
    previous = e.hash;
    nextSequence++;
    checked++;
  }
  return { ok: true, checked, lastHash: previous };
}

// ─── Payloads ──────────────────────────────────────────────────────────────

export interface JournalLine {
  label: string;
  quantity: number;
  unitPrice: string;
  vatRate: number;
  ht: string;
  vat: string;
  ttc: string;
}

export interface JournalPayment {
  method: string;
  amount: string;
}

/** Flip every amount of a recorded event: the "moins" that cancels it. */
export function negate(lines: JournalLine[], payments: JournalPayment[]) {
  const neg = (v: string) => journalAmount(-toNum(v));
  return {
    lines: lines.map((l) => ({ ...l, quantity: -l.quantity, ht: neg(l.ht), vat: neg(l.vat), ttc: neg(l.ttc) })),
    payments: payments.map((p) => ({ ...p, amount: neg(p.amount) })),
  };
}

interface PosTransactionForJournal {
  id: string;
  ticketNumber: string;
  transactionDate: Date;
  subtotal: unknown;
  taxAmount: unknown;
  finalAmount: unknown;
  discountAmount: unknown;
  stampDuty: unknown;
  lines: Array<{
    designation: string;
    quantity: number;
    unitPrice: unknown;
    taxRate: number;
    subtotal: unknown;
    taxAmount: unknown;
    total: unknown;
    isBundleHeader: boolean;
  }>;
  payments: Array<{ paymentMethod: string; amount: unknown; changeGiven?: unknown }>;
}

/** The lines and payments of a till sale, as the journal records them. */
export function posSaleContent(t: PosTransactionForJournal) {
  const lines: JournalLine[] = t.lines
    // A pack header is worth its components, which are lines of their own.
    .filter((l) => !l.isBundleHeader)
    .map((l) => ({
      label: l.designation,
      quantity: l.quantity,
      unitPrice: journalAmount(l.unitPrice),
      vatRate: l.taxRate,
      ht: journalAmount(l.subtotal),
      vat: journalAmount(l.taxAmount),
      ttc: journalAmount(l.total),
    }));
  const payments: JournalPayment[] = t.payments.map((p) => ({
    method: p.paymentMethod,
    // What stayed in the till: the change handed back is not a payment.
    amount: journalAmount(toNum(p.amount) - toNum(p.changeGiven ?? 0)),
  }));
  return { lines, payments };
}

export interface Operator {
  id: string;
  name: string | null;
}

export interface Register {
  id: string;
  name: string | null;
}

export function posSalePayload(t: PosTransactionForJournal, register: Register, operator: Operator) {
  const { lines, payments } = posSaleContent(t);
  return {
    ticketNumber: t.ticketNumber,
    transactionDate: t.transactionDate.toISOString(),
    register,
    operator,
    lines,
    totals: {
      ht: journalAmount(t.subtotal),
      vat: journalAmount(t.taxAmount),
      discount: journalAmount(t.discountAmount),
      ttc: journalAmount(t.finalAmount),
      stampDuty: journalAmount(t.stampDuty),
    },
    payments,
  };
}

/**
 * A payment recorded against an invoice (BOFiP §40: software that follows the
 * payments it collects is in scope, whatever it is called). Recording one is a
 * PAYMENT; deleting it, or the old side of an edit, a PAYMENT_REVERSAL.
 */
export async function journalInvoicePayment(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    userId: string;
    kind: "PAYMENT" | "PAYMENT_REVERSAL";
    payment: { id: string; invoiceId: string; amount: unknown; paymentMethod: string; paymentDate: Date };
  }
) {
  const [invoice, operator] = await Promise.all([
    tx.invoice.findFirst({
      where: { tenantId: input.tenantId, id: input.payment.invoiceId },
      select: { invoiceNumber: true },
    }),
    tx.user.findFirst({ where: { tenantId: input.tenantId, id: input.userId }, select: { displayName: true } }),
  ]);
  const sign = input.kind === "PAYMENT" ? 1 : -1;
  const amount = sign * toNum(input.payment.amount);
  return appendJournal(tx, {
    tenantId: input.tenantId,
    kind: input.kind,
    referenceId: input.payment.id,
    amount,
    payload: {
      invoiceNumber: invoice?.invoiceNumber ?? null,
      paymentDate: input.payment.paymentDate.toISOString().slice(0, 10),
      operator: { id: input.userId, name: operator?.displayName ?? null },
      totals: { ttc: journalAmount(amount) },
      payments: [{ method: input.payment.paymentMethod, amount: journalAmount(amount) }],
    },
  });
}
