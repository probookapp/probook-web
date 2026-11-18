import { describe, expect, it } from "vitest";
import {
  paymentOverdueEmail,
  paymentOverdueEmailPlainText,
  quoteExpiringEmail,
  quoteExpiringEmailPlainText,
} from "../email";

const overdue = {
  companyName: "Numidia",
  clientName: "Atlas",
  invoiceNumber: "FAC-1",
  total: 74970,
  currency: "DZD",
  dueDate: "2026-07-01",
};

describe("reminder emails speak the business's language", () => {
  it("writes French by default, with the amount still owed", () => {
    const { subject, html } = paymentOverdueEmail(overdue);
    expect(subject).toBe("Relance : facture FAC-1");
    expect(html).toContain("Bonjour Atlas,");
    expect(html).toContain("Reste à payer");
    expect(html).toContain("01/07/2026");
    expect(html).not.toContain("Dear");
  });

  it("writes Arabic and English when the account uses them", () => {
    expect(paymentOverdueEmail({ ...overdue, lang: "ar" }).subject).toBe("تذكير بالدفع: الفاتورة FAC-1");
    expect(paymentOverdueEmailPlainText({ ...overdue, lang: "ar" }).body).toContain("المبلغ المتبقي");
    expect(paymentOverdueEmail({ ...overdue, lang: "en" }).html).toContain("Dear Atlas,");
  });

  it("falls back to French for an unknown or system language", () => {
    expect(paymentOverdueEmail({ ...overdue, lang: "system" }).subject).toBe("Relance : facture FAC-1");
  });

  it("writes amounts with the currency's own decimals and Latin digits", () => {
    const tnd = paymentOverdueEmailPlainText({ ...overdue, total: 12.5, currency: "TND" }).body;
    expect(tnd).toMatch(/12,500\s?TND/);
    const ar = paymentOverdueEmailPlainText({ ...overdue, total: 1000, lang: "ar" }).body;
    expect(ar).toMatch(/1[.,٬  ]?000/);
  });

  it("translates the quote reminder too", () => {
    const quote = { companyName: "N", clientName: "C", quoteNumber: "DEV-1", total: 10, currency: "EUR", validityDate: "2026-12-01" };
    expect(quoteExpiringEmail(quote).subject).toBe("Votre devis DEV-1 arrive à échéance");
    expect(quoteExpiringEmailPlainText({ ...quote, lang: "en" }).body).toContain("Valid until : 01/12/2026");
  });
});
