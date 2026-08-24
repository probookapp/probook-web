import { describe, it, expect } from "vitest";
import { buildEscPosReceipt, type ReceiptData } from "../receipt-printer";

/**
 * The ticket is the document the droit de timbre is charged on.
 *
 * Article 100 of the Code du timbre taxes the transaction *constatée par une
 * facture ou un ticket* — so a till that charges the duty and prints a ticket
 * that ignores it has issued the wrong document, and one whose TOTAL is the
 * goods alone tells the cashier to hand the tax back in change.
 */
const base: ReceiptData = {
  companyName: "Demo",
  ticketNumber: "T-1",
  date: "2026-08-23",
  items: [
    {
      designation: "Article",
      quantity: 1,
      unitPrice: 5000,
      total: 5000,
      taxRate: 0,
      discountPercent: 0,
    },
  ],
  subtotal: 5000,
  taxAmount: 0,
  total: 5000,
  discountPercent: 0,
  discountAmount: 0,
  finalAmount: 5000,
  payments: [],
  currency: "DZD",
};

const printed = (data: ReceiptData) => new TextDecoder().decode(buildEscPosReceipt(data));

describe("the printed ticket and the stamp duty", () => {
  it("names the duty and adds it to the total the customer pays", () => {
    const text = printed({
      ...base,
      stampDuty: 50,
      payments: [{ method: "CASH", amount: 5000, cashGiven: 6000, changeGiven: 950 }],
    });

    expect(text).toContain("Stamp duty");
    expect(text).toMatch(/Stamp duty\s+50\.00 DZD/);
    // 5 000 of goods + 50 of duty. Printing 5 000 here was the bug: the ticket
    // did not balance against the cash it acknowledged taking.
    expect(text).toMatch(/TOTAL\s+5050\.00 DZD/);
    expect(text).toMatch(/Change\s+950\.00 DZD/);
  });

  it("says nothing about a duty that was never charged", () => {
    const text = printed({
      ...base,
      payments: [{ method: "CARD", amount: 5000 }],
    });

    expect(text).not.toContain("Stamp duty");
    expect(text).toMatch(/TOTAL\s+5000\.00 DZD/);
  });

  it("prints the three mentions that exempt a cheque", () => {
    const text = printed({
      ...base,
      stampDuty: 0,
      payments: [
        {
          method: "CHEQUE",
          amount: 5000,
          chequeDate: "2026-08-20",
          chequeNumber: "1234567",
          chequeBank: "BNA",
        },
      ],
    });

    // Article 258 exempts the receipt only if it carries them, so they belong on
    // the paper, not merely in the database.
    expect(text).toContain("1234567");
    expect(text).toContain("2026-08-20");
    expect(text).toContain("BNA");
  });

  it("still totals correctly for a ticket built before the duty existed", () => {
    // `stampDuty` is optional: an offline sale queued by an older client replays
    // through this same printer.
    const text = printed({ ...base, payments: [{ method: "CASH", amount: 5000 }] });
    expect(text).toMatch(/TOTAL\s+5000\.00 DZD/);
  });
});
