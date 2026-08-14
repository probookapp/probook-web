import { Prisma } from "@/generated/prisma/client";

/**
 * Money boundary helpers (audit DATA-3).
 *
 * Money is stored as NUMERIC(16,3) and surfaces from Prisma as Decimal
 * objects. Computation stays in plain JS numbers: convert with num() at the
 * read boundary, do arithmetic, and round with round2/round3 before writing
 * back (Prisma accepts numbers into Decimal columns). API responses convert
 * Decimals to numbers centrally in toSnakeCase, so num() is only needed where
 * server code does arithmetic on values read from the database.
 */

/** Decimal | number | null | undefined → number (null/undefined → 0). */
export function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * ─── Currency-aware rounding ───
 *
 * Rounding to two decimals is right for the dinar algérien, the dirham and the
 * euro — and wrong for the dinar tunisien, which is denominated in millimes.
 * A TND amount of 12.345 used to be computed as 12.35 and then displayed as
 * "12,350 TND": the millime was dropped and the figure on screen was not the
 * figure that had been charged. The NUMERIC(16,3) columns could always hold it;
 * only the arithmetic was truncating.
 *
 * Explicit table for the currencies the app offers, so behaviour does not
 * depend on the ICU data of whatever runtime this executes on.
 */
const MINOR_UNITS: Record<string, number> = {
  DZD: 2,
  MAD: 2,
  EUR: 2,
  USD: 2,
  GBP: 2,
  CAD: 2,
  CHF: 2,
  // Millime currencies.
  TND: 3,
  LYD: 3,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
};

/** The columns store three decimals; never round to more than they can hold. */
export const MAX_MINOR_UNITS = 3;

export function currencyMinorUnits(currency: string | null | undefined): number {
  if (!currency) return 2;
  const known = MINOR_UNITS[currency.toUpperCase()];
  if (known !== undefined) return known;

  // Unknown code: ask the runtime, then clamp to what we can store.
  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).resolvedOptions().maximumFractionDigits;
    if (typeof digits === "number" && Number.isFinite(digits)) {
      return Math.min(MAX_MINOR_UNITS, Math.max(0, digits));
    }
  } catch {
    // Not a currency the runtime knows — fall through to the safe default.
  }
  return 2;
}

/** Round to an explicit number of decimals, for callers that already resolved it. */
export function roundToUnits(amount: number, minorUnits: number): number {
  if (!Number.isFinite(amount)) return 0;
  const factor = 10 ** Math.min(MAX_MINOR_UNITS, Math.max(0, minorUnits));
  return Math.round(amount * factor) / factor;
}

/** Round an amount to its currency's smallest unit. */
export function roundMoney(amount: number, currency: string | null | undefined): number {
  return roundToUnits(amount, currencyMinorUnits(currency));
}
