import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  computeEntryHash,
  GENESIS_HASH,
  journalAmount,
  negate,
  posSaleContent,
  verifyChain,
  type StoredEntry,
} from "../pos-journal";
import { aggregateEntries, localDay } from "../pos-closures";

/** A chain built the way appendJournal builds it. */
function chain(amounts: number[]): StoredEntry[] {
  const out: StoredEntry[] = [];
  let previous = GENESIS_HASH;
  amounts.forEach((amount, i) => {
    const entry = {
      tenantId: "t1",
      sequence: i + 1,
      kind: amount >= 0 ? "SALE" : "CANCELLATION",
      referenceId: `ref-${i + 1}`,
      amount: journalAmount(amount),
      occurredAt: new Date(Date.UTC(2026, 10, 3, 9, i)),
      payload: { payments: [{ method: "CASH", amount: journalAmount(amount) }] },
      previousHash: previous,
    };
    const hash = computeEntryHash({ ...entry, occurredAt: entry.occurredAt.toISOString() });
    out.push({ ...entry, hash });
    previous = hash;
  });
  return out;
}

describe("secured journal chain", () => {
  it("verifies an untouched chain", () => {
    const verdict = verifyChain(chain([10, 20, -10]));
    expect(verdict).toMatchObject({ ok: true, checked: 3 });
  });

  it("detects an altered amount at the altered entry", () => {
    const entries = chain([10, 20, 30]);
    entries[1] = { ...entries[1], amount: "2.000" };
    expect(verifyChain(entries)).toMatchObject({ ok: false, brokenAt: 2, reason: "hash" });
  });

  it("detects an altered payload", () => {
    const entries = chain([10, 20]);
    entries[0] = { ...entries[0], payload: { payments: [{ method: "CARD", amount: "10.000" }] } };
    expect(verifyChain(entries)).toMatchObject({ ok: false, brokenAt: 1, reason: "hash" });
  });

  it("detects a deleted entry", () => {
    const entries = chain([10, 20, 30]);
    entries.splice(1, 1);
    expect(verifyChain(entries)).toMatchObject({ ok: false, brokenAt: 2, reason: "gap" });
  });

  it("detects an entry recomputed in place, through the next link", () => {
    const entries = chain([10, 20, 30]);
    // Someone with the data but rewriting entry 2 consistently with itself
    // still cannot make entry 3 point at it without the key.
    const forged = { ...entries[1], amount: "2.000", hash: "j1:forged" };
    entries[1] = forged;
    expect(verifyChain(entries)).toMatchObject({ ok: false, brokenAt: 2 });
  });

  it("does not depend on key order in the payload (JSONB reorders keys)", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      canonicalJson({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 })
    );
  });

  it("writes money with three decimals and never -0", () => {
    expect(journalAmount(12.5)).toBe("12.500");
    expect(journalAmount(-0)).toBe("0.000");
    expect(journalAmount("7")).toBe("7.000");
    expect(journalAmount({ toNumber: () => 1.2345 })).toBe("1.235");
  });
});

describe("till sale content", () => {
  const sale = {
    id: "s1",
    ticketNumber: "TK-1",
    transactionDate: new Date(),
    subtotal: 100,
    taxAmount: 19,
    finalAmount: 119,
    discountAmount: 0,
    stampDuty: 0,
    lines: [
      { designation: "Pack", quantity: 1, unitPrice: 100, taxRate: 19, subtotal: 100, taxAmount: 19, total: 119, isBundleHeader: true },
      { designation: "Item", quantity: 2, unitPrice: 50, taxRate: 19, subtotal: 100, taxAmount: 19, total: 119, isBundleHeader: false },
    ],
    payments: [{ paymentMethod: "CASH", amount: 150, changeGiven: 31 }],
  };

  it("skips pack headers and records what stayed in the till", () => {
    const { lines, payments } = posSaleContent(sale);
    expect(lines.map((l) => l.label)).toEqual(["Item"]);
    expect(payments).toEqual([{ method: "CASH", amount: "119.000" }]);
  });

  it("negates every amount for a cancellation", () => {
    const { lines, payments } = posSaleContent(sale);
    const neg = negate(lines, payments);
    expect(neg.lines[0]).toMatchObject({ quantity: -2, ht: "-100.000", vat: "-19.000", ttc: "-119.000" });
    expect(neg.payments[0].amount).toBe("-119.000");
  });
});

describe("closures", () => {
  it("cuts days in the business's local time", () => {
    // 23:30 UTC on 3 Nov is 00:30 on 4 Nov in Paris (UTC+1) and Algiers (UTC+1).
    const at = new Date(Date.UTC(2026, 10, 3, 23, 30));
    expect(localDay(at, "Europe/Paris")).toBe("2026-11-04");
    expect(localDay(at, "Africa/Algiers")).toBe("2026-11-04");
    expect(localDay(at, "UTC")).toBe("2026-11-03");
  });

  it("totals by kind, payment method and VAT rate, corrections included", () => {
    const agg = aggregateEntries([
      {
        sequence: 1,
        kind: "SALE",
        amount: "119.000",
        occurredAt: new Date(),
        payload: {
          lines: [{ vatRate: 19, ht: "100.000", vat: "19.000" }],
          payments: [{ method: "CASH", amount: "119.000" }],
        },
      },
      {
        sequence: 2,
        kind: "CANCELLATION",
        amount: "-119.000",
        occurredAt: new Date(),
        payload: {
          lines: [{ vatRate: 19, ht: "-100.000", vat: "-19.000" }],
          payments: [{ method: "CASH", amount: "-119.000" }],
        },
      },
      {
        sequence: 3,
        kind: "PAYMENT",
        amount: "50.000",
        occurredAt: new Date(),
        payload: { payments: [{ method: "transfer", amount: "50.000" }] },
      },
    ]);
    expect(agg.total).toBe(50);
    expect(agg.firstSequence).toBe(1);
    expect(agg.lastSequence).toBe(3);
    expect(agg.breakdown.byKind).toEqual({ SALE: "119.000", CANCELLATION: "-119.000", PAYMENT: "50.000" });
    expect(agg.breakdown.byMethod).toEqual({ CASH: "0.000", transfer: "50.000" });
    expect(agg.breakdown.vatByRate).toEqual({ "19": { ht: "0.000", vat: "0.000" } });
  });
});
