import { describe, it, expect } from "vitest";
import {
  calculateLineTotal,
  generateQuoteNumber,
  generateInvoiceNumber,
  formatDateISO,
  numberToFrenchWords,
  CURRENCY_WORDS,
} from "../utils";

// ─── calculateLineTotal ────────────────────────────────────────────────────

describe("calculateLineTotal", () => {
  it("calculates subtotal, tax, and total for standard values", () => {
    const result = calculateLineTotal(2, 100, 20);
    expect(result.subtotal).toBe(200);
    expect(result.taxAmount).toBe(40);
    expect(result.total).toBe(240);
  });

  it("handles zero tax rate", () => {
    const result = calculateLineTotal(5, 50, 0);
    expect(result.subtotal).toBe(250);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(250);
  });

  it("handles zero quantity", () => {
    const result = calculateLineTotal(0, 100, 19);
    expect(result.subtotal).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(0);
  });

  it("handles fractional quantities", () => {
    const result = calculateLineTotal(1.5, 100, 20);
    expect(result.subtotal).toBe(150);
    expect(result.taxAmount).toBe(30);
    expect(result.total).toBe(180);
  });

  it("handles 100% tax rate", () => {
    const result = calculateLineTotal(1, 100, 100);
    expect(result.subtotal).toBe(100);
    expect(result.taxAmount).toBe(100);
    expect(result.total).toBe(200);
  });
});

// ─── generateQuoteNumber / generateInvoiceNumber ───────────────────────────

describe("generateQuoteNumber", () => {
  it("generates number with prefix, year, and zero-padded sequence", () => {
    const num = generateQuoteNumber("DEV-", 1);
    const year = new Date().getFullYear();
    expect(num).toBe(`DEV-${year}-0001`);
  });

  it("pads up to 4 digits", () => {
    const num = generateQuoteNumber("Q", 42);
    const year = new Date().getFullYear();
    expect(num).toBe(`Q${year}-0042`);
  });

  it("handles numbers with more than 4 digits", () => {
    const num = generateQuoteNumber("Q", 12345);
    const year = new Date().getFullYear();
    expect(num).toBe(`Q${year}-12345`);
  });
});

describe("generateInvoiceNumber", () => {
  it("generates number with prefix, year, and zero-padded sequence", () => {
    const num = generateInvoiceNumber("FA", 7);
    const year = new Date().getFullYear();
    expect(num).toBe(`FA${year}-0007`);
  });
});

// ─── formatDateISO ─────────────────────────────────────────────────────────

describe("formatDateISO", () => {
  it("formats a date to YYYY-MM-DD", () => {
    const d = new Date("2024-03-15T10:30:00Z");
    expect(formatDateISO(d)).toBe("2024-03-15");
  });

  it("handles start of year", () => {
    const d = new Date("2025-01-01T00:00:00Z");
    expect(formatDateISO(d)).toBe("2025-01-01");
  });
});

// ─── numberToFrenchWords ───────────────────────────────────────────────────

describe("numberToFrenchWords", () => {
  it("converts zero", () => {
    expect(numberToFrenchWords(0)).toBe("Zéro euro");
  });

  it("converts 1 (singular unit)", () => {
    expect(numberToFrenchWords(1)).toBe("Un euro");
  });

  it("converts simple numbers", () => {
    expect(numberToFrenchWords(5, "dinar", "centime")).toBe("Cinq dinars");
  });

  it("converts numbers with cents", () => {
    const result = numberToFrenchWords(1.50, "euro", "centime");
    expect(result).toBe("Un euro et cinquante centimes");
  });

  it("converts large numbers", () => {
    const result = numberToFrenchWords(1000, "euro", "centime");
    expect(result).toBe("Mille euros");
  });

  it("converts tens correctly — 21 uses 'et un'", () => {
    const result = numberToFrenchWords(21, "euro", "centime");
    expect(result).toBe("Vingt et un euros");
  });

  it("converts 70-79 range (soixante-dix)", () => {
    const result = numberToFrenchWords(71, "euro", "centime");
    expect(result).toBe("Soixante et onze euros");
  });

  it("converts 80 (quatre-vingts)", () => {
    const result = numberToFrenchWords(80, "euro", "centime");
    expect(result).toBe("Quatre-vingts euros");
  });

  it("converts 90-99 range (quatre-vingt-dix)", () => {
    const result = numberToFrenchWords(91, "euro", "centime");
    expect(result).toBe("Quatre-vingt-onze euros");
  });

  it("converts hundreds", () => {
    const result = numberToFrenchWords(200, "euro", "centime");
    expect(result).toBe("Deux cents euros");
  });

  it("converts 100 (singular cent, no 's')", () => {
    const result = numberToFrenchWords(100, "euro", "centime");
    expect(result).toBe("Cent euros");
  });

  it("converts complex amounts with centimes", () => {
    const result = numberToFrenchWords(1234.56, "dinar", "centime");
    expect(result.toLowerCase()).toContain("mille");
    expect(result).toContain("centime");
  });

  it("handles 1 centime (singular)", () => {
    const result = numberToFrenchWords(0.01, "euro", "centime");
    expect(result).toBe("Zéro euro et un centime");
  });

  it("converts millions", () => {
    const result = numberToFrenchWords(1000000, "euro", "centime");
    expect(result).toBe("Un million euros");
  });
});

// ─── CURRENCY_WORDS ────────────────────────────────────────────────────────

describe("CURRENCY_WORDS", () => {
  it("has entries for all expected currencies", () => {
    const expected = ["EUR", "USD", "GBP", "DZD", "MAD", "TND", "CAD", "CHF"];
    for (const code of expected) {
      expect(CURRENCY_WORDS[code]).toBeDefined();
      expect(CURRENCY_WORDS[code].main).toBeTruthy();
      expect(CURRENCY_WORDS[code].sub).toBeTruthy();
    }
  });
});
