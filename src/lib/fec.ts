/**
 * Fichier des écritures comptables (FEC), article A47 A-1 du livre des
 * procédures fiscales: the 18 columns, in order, tab-separated, one line per
 * debit or credit, every écriture balanced.
 *
 * Probook is not an accounting package, so this is not the company's legal
 * FEC on its own: it is the sales, purchases and settlements Probook knows,
 * already written as double-entry lines with standard plan comptable général
 * accounts, for the accountant to import. The accountant keeps the books.
 *
 * Kept pure (no database) so the bookkeeping is testable on its own; the route
 * (src/app/api/reports/fec) gathers the documents and hands them here.
 */

import { moneyBucket } from "./payment-methods";

export const FEC_COLUMNS = [
  "JournalCode",
  "JournalLib",
  "EcritureNum",
  "EcritureDate",
  "CompteNum",
  "CompteLib",
  "CompAuxNum",
  "CompAuxLib",
  "PieceRef",
  "PieceDate",
  "EcritureLib",
  "Debit",
  "Credit",
  "EcritureLet",
  "DateLet",
  "ValidDate",
  "Montantdevise",
  "Idevise",
] as const;

/** The plan comptable général accounts used, with their labels. */
export const ACCOUNTS = {
  clients: ["411000", "Clients"],
  // A deposit taken on a quote before any invoice exists.
  clientAdvances: ["419100", "Clients - avances et acomptes reçus"],
  suppliers: ["401000", "Fournisseurs"],
  salesGoods: ["707000", "Ventes de marchandises"],
  salesServices: ["706000", "Prestations de services"],
  shipping: ["708500", "Ports et frais accessoires facturés"],
  vatCollected: ["445710", "TVA collectée"],
  vatDeductible: ["445660", "TVA déductible sur biens et services"],
  purchases: ["607000", "Achats de marchandises"],
  expenses: ["628000", "Charges diverses"],
  bank: ["512000", "Banque"],
  cash: ["530000", "Caisse"],
} as const;

export const JOURNALS = {
  VE: "Ventes",
  HA: "Achats",
  BQ: "Banque",
  CA: "Caisse",
} as const;
export type JournalCode = keyof typeof JOURNALS;

type Account = readonly [string, string];

export interface FecLine {
  account: Account;
  aux?: { num: string; lib: string } | null;
  label: string;
  debit: number;
  credit: number;
}

export interface FecEntry {
  journal: JournalCode;
  date: Date;
  pieceRef: string;
  pieceDate: Date;
  lines: FecLine[];
}

const cents = (n: number) => Math.round(n * 100);

/** Make an écriture balance: a rounding cent goes to its largest line. */
export function balance(entry: FecEntry): FecEntry {
  const lines = entry.lines.filter((l) => cents(l.debit) !== 0 || cents(l.credit) !== 0);
  const diff = lines.reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0);
  if (diff !== 0 && lines.length > 0) {
    // Adjust on the side that is short, on its biggest line.
    const side = diff > 0 ? "credit" : "debit";
    const target = lines
      .filter((l) => l[side] > 0)
      .sort((a, b) => b[side] - a[side])[0];
    if (target) target[side] = (cents(target[side]) + Math.abs(diff)) / 100;
  }
  return { ...entry, lines };
}

/**
 * The bank or cash account a payment method lands in. Read through
 * moneyBucket: invoice payments say "especes", not "CASH", and used to land in
 * the bank.
 */
export function settlementAccount(method: string | null | undefined): Account {
  return moneyBucket(method) === "cash" ? ACCOUNTS.cash : ACCOUNTS.bank;
}

export function settlementJournal(method: string | null | undefined): JournalCode {
  return moneyBucket(method) === "cash" ? "CA" : "BQ";
}

/** An auxiliary account number for a client or supplier: stable and short. */
export function auxNum(prefix: "C" | "F", id: string): string {
  return `${prefix}${id.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

/** "1234,56": comma decimal, no thousands separator. */
const amount = (n: number) => (cents(n) / 100).toFixed(2).replace(".", ",");

/** No tab or line break may leak into a field. */
const field = (s: string) => s.replace(/[\t\r\n|]+/g, " ").trim();

/**
 * Serialise. Écritures are numbered per journal in date order, so each
 * journal's sequence is continuous; ValidDate is the écriture date, since
 * these come from issued documents that can no longer change.
 */
export function serializeFec(entries: FecEntry[], currency: string): string {
  const sorted = [...entries].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.pieceRef.localeCompare(b.pieceRef)
  );
  const counters: Record<string, number> = {};
  const rows: string[] = [FEC_COLUMNS.join("\t")];
  for (const raw of sorted) {
    const entry = balance(raw);
    if (entry.lines.length === 0) continue;
    counters[entry.journal] = (counters[entry.journal] ?? 0) + 1;
    const num = `${entry.journal}${String(counters[entry.journal]).padStart(6, "0")}`;
    for (const l of entry.lines) {
      rows.push(
        [
          entry.journal,
          JOURNALS[entry.journal],
          num,
          ymd(entry.date),
          l.account[0],
          l.account[1],
          l.aux?.num ?? "",
          field(l.aux?.lib ?? ""),
          field(entry.pieceRef),
          ymd(entry.pieceDate),
          field(l.label),
          amount(l.debit),
          amount(l.credit),
          "",
          "",
          ymd(entry.date),
          currency === "EUR" ? "" : amount(l.debit - l.credit),
          currency === "EUR" ? "" : currency,
        ].join("\t")
      );
    }
  }
  return rows.join("\r\n") + "\r\n";
}

/**
 * ISO 8859-15, the encoding the administration lists for the FEC. Latin-1
 * plus the euro sign and the few letters 8859-15 moved; anything else is
 * replaced with "?" rather than silently corrupted.
 */
export function encodeIso885915(text: string): Uint8Array {
  const special: Record<string, number> = {
    "€": 0xa4, "Š": 0xa6, "š": 0xa8, "Ž": 0xb4, "ž": 0xb8, "Œ": 0xbc, "œ": 0xbd, "Ÿ": 0xbe,
  };
  const replaced = new Set([0xa4, 0xa6, 0xa8, 0xb4, 0xb8, 0xbc, 0xbd, 0xbe]);
  const out = new Uint8Array(text.length);
  let i = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch in special) out[i++] = special[ch];
    else if (code < 0x100 && !replaced.has(code)) out[i++] = code;
    else out[i++] = 0x3f;
  }
  return out.slice(0, i);
}

/** "123456789FEC20261231.txt": SIREN, "FEC", closing date. */
export function fecFileName(siret: string | null | undefined, closing: Date): string {
  const siren = (siret ?? "").replace(/\D/g, "").slice(0, 9) || "000000000";
  return `${siren}FEC${ymd(closing)}.txt`;
}
