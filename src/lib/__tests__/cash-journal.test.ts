import { describe, it, expect } from "vitest";
import { buildCashJournal, type CashMovement } from "../cash-journal";
import { moneyBucket, paymentMethodLabelKey } from "../payment-methods";
import { settlementAccount, settlementJournal, ACCOUNTS } from "../fec";

const move = (over: Partial<CashMovement>): CashMovement => ({
  id: Math.random().toString(36).slice(2),
  date: "2026-11-10",
  kind: "invoice_payment",
  amount: 100,
  method: "especes",
  reference: "INV-1",
  party: "Client",
  link: null,
  ...over,
});

describe("moneyBucket", () => {
  it("reads every vocabulary the app has stored", () => {
    // Invoice payments and expenses.
    expect(moneyBucket("especes")).toBe("cash");
    expect(moneyBucket("cheque")).toBe("cheque");
    expect(moneyBucket("virement")).toBe("bank");
    expect(moneyBucket("carte")).toBe("bank");
    expect(moneyBucket("prelevement")).toBe("bank");
    // The till.
    expect(moneyBucket("CASH")).toBe("cash");
    expect(moneyBucket("CHEQUE")).toBe("cheque");
    expect(moneyBucket("CARD")).toBe("bank");
    expect(moneyBucket("TRANSFER")).toBe("bank");
    // Supplier payments.
    expect(moneyBucket("CHECK")).toBe("cheque");
    expect(moneyBucket("BANK_TRANSFER")).toBe("bank");
  });

  it("places no money for credit, 'other' or nothing", () => {
    expect(moneyBucket("CREDIT")).toBeNull();
    expect(moneyBucket("autre")).toBeNull();
    expect(moneyBucket("OTHER")).toBeNull();
    expect(moneyBucket(null)).toBeNull();
  });

  it("labels a method from any vocabulary with one set of keys", () => {
    expect(paymentMethodLabelKey("CASH")).toBe("payments.methods.cash");
    expect(paymentMethodLabelKey("especes")).toBe("payments.methods.cash");
    expect(paymentMethodLabelKey("CHECK")).toBe("payments.methods.check");
    expect(paymentMethodLabelKey("BANK_TRANSFER")).toBe("payments.methods.transfer");
    expect(paymentMethodLabelKey("whatever")).toBe("payments.methods.other");
  });
});

describe("FEC settlement", () => {
  it("books an invoice paid 'especes' to the cash account, not the bank", () => {
    expect(settlementAccount("especes")).toBe(ACCOUNTS.cash);
    expect(settlementJournal("especes")).toBe("CA");
    expect(settlementAccount("cheque")).toBe(ACCOUNTS.bank);
  });
});

describe("buildCashJournal", () => {
  const opening = { start: "2026-11-01", cash: 1000, cheque: 0, bank: 5000 };
  const period = { from: "2026-11-01", to: "2026-11-30" };

  it("adds money in and takes money out, bucket by bucket, from the declared opening", () => {
    const journal = buildCashJournal(opening, period, [
      move({ amount: 300, method: "especes" }),
      move({ amount: 200, method: "cheque", kind: "quote_deposit" }),
      move({ amount: -150, method: "CASH", kind: "supplier_payment" }),
      move({ amount: -40, method: "carte", kind: "expense" }),
    ]);
    expect(journal.buckets.cash).toEqual({ opening: 1000, in: 300, out: 150, closing: 1150 });
    expect(journal.buckets.cheque).toEqual({ opening: 0, in: 200, out: 0, closing: 200 });
    expect(journal.buckets.bank).toEqual({ opening: 5000, in: 0, out: 40, closing: 4960 });
  });

  it("ignores what predates the declared start: it is inside the opening figures", () => {
    const journal = buildCashJournal(opening, period, [move({ date: "2026-10-31", amount: 999 })]);
    expect(journal.rows).toHaveLength(0);
    expect(journal.buckets.cash.closing).toBe(1000);
  });

  it("folds what happened between the start and the period into the balance the period opens on", () => {
    const journal = buildCashJournal(opening, { from: "2026-11-15", to: "2026-11-30" }, [
      move({ date: "2026-11-05", amount: 500 }),
      move({ date: "2026-11-20", amount: 100 }),
    ]);
    expect(journal.buckets.cash.opening).toBe(1500);
    expect(journal.buckets.cash.in).toBe(100);
    expect(journal.rows).toHaveLength(1);
  });

  it("leaves after-period movements out entirely", () => {
    const journal = buildCashJournal(opening, period, [move({ date: "2026-12-02", amount: 500 })]);
    expect(journal.rows).toHaveLength(0);
    expect(journal.buckets.cash.closing).toBe(1000);
  });

  it("lists money with no usable method but counts it in no balance", () => {
    const journal = buildCashJournal(opening, period, [
      move({ amount: -60, method: null, kind: "expense" }),
      move({ amount: 80, method: "autre" }),
    ]);
    expect(journal.rows).toHaveLength(2);
    expect(journal.unclassified).toEqual({ count: 2, total: 20 });
    expect(journal.buckets.cash.closing).toBe(1000);
  });

  it("counts everything from zero when no start was declared", () => {
    const journal = buildCashJournal({ start: null, cash: 0, cheque: 0, bank: 0 }, period, [
      move({ date: "2025-01-01", amount: 70 }),
      move({ amount: 30 }),
    ]);
    expect(journal.buckets.cash.opening).toBe(70);
    expect(journal.buckets.cash.closing).toBe(100);
  });

  it("reads oldest first, money in before money out on the same day", () => {
    const journal = buildCashJournal(opening, period, [
      move({ id: "out", date: "2026-11-03", amount: -10 }),
      move({ id: "in", date: "2026-11-03", amount: 10 }),
      move({ id: "first", date: "2026-11-02", amount: 5 }),
    ]);
    expect(journal.rows.map((r) => r.id)).toEqual(["first", "in", "out"]);
  });
});
