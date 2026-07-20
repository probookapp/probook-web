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
