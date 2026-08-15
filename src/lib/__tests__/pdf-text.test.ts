import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { pdfSafe, pdfCurrency, DOCUMENT_LOCALES } from "@/features/pdf/text";

/**
 * PDFs are set in Helvetica, whose WinAnsi encoding stops at 0xFF — and pdfkit
 * does not refuse a character it cannot encode. It truncates the code point to
 * its low byte and prints whatever lands there.
 *
 * `Intl` separates French thousands with U+202F, the narrow no-break space.
 * Truncated, that is 0x2F: a slash. Every invoice, quote and report went out
 * reading "42/000,00DZD" instead of "42 000,00 DZD", and nothing anywhere
 * failed — the documents were simply wrong on paper, at the client's end.
 */

const PDF_DIR = join(__dirname, "..", "..", "features", "pdf");

/** Anything WinAnsi cannot carry, so anything pdfkit will mangle in silence. */
function unencodable(text: string): string[] {
  return [...text].filter((ch) => ch.codePointAt(0)! > 0xff);
}

describe("PDF text", () => {
  it("strips the spaces Intl uses and Helvetica cannot print", () => {
    // Written as escapes on purpose: these characters are invisible in a source
    // file, so a literal here could quietly become a plain space and the test
    // would pass while proving nothing.
    const narrow = "42" + "\u202F" + "000,00" + "\u00A0" + "DZD";
    expect(pdfSafe(narrow)).toBe("42 000,00 DZD");
    expect(narrow).not.toBe("42 000,00 DZD");
  });

  it("removes bidi marks, which print as garbage rather than as nothing", () => {
    expect(pdfSafe("\u200F42 000\u200E")).toBe("42 000");
  });

  it("produces only characters Helvetica can encode", () => {
    for (const amount of [0, 0.5, 1234.56, 42_000, 178_166.8, 9_999_999.99, -7880]) {
      const printed = pdfCurrency(amount);
      expect(unencodable(printed), `${amount} -> ${JSON.stringify(printed)}`).toEqual([]);
      // The exact failure that shipped: a slash where a separator belongs.
      expect(printed).not.toMatch(/\d\/\d/);
    }
  });

  it("keeps every PDF component off the raw formatter", () => {
    // The bug came back as fast as someone typing formatCurrency() in a PDF.
    // ReportPDF is exempt: it receives strings already formatted by the caller
    // and sanitises them itself on the way in.
    const offenders: string[] = [];
    for (const file of readdirSync(PDF_DIR)) {
      if (!file.endsWith(".tsx")) continue;
      const source = readFileSync(join(PDF_DIR, file), "utf8");
      if (/\bformatCurrency\s*\(/.test(source)) offenders.push(file);
    }
    expect(offenders, "PDF components must use pdfCurrency, not formatCurrency").toEqual([]);
  });
  it("only offers document languages Helvetica can actually print", () => {
    // The slash in "42/000,00" was the small version of this. The large one is
    // an Arabic invoice: every label truncated to its low byte, so "الوصف"
    // printed as "A5HD'". Amounts were guarded; the labels were not, and the
    // labels are most of the document.
    //
    // A language belongs in DOCUMENT_LOCALES only once its bundle is printable
    // — which today means an embedded font, not one of the base fourteen.
    for (const locale of DOCUMENT_LOCALES) {
      const bundle = JSON.parse(
        readFileSync(join(__dirname, "..", "..", "i18n", "locales", locale, "pdf.json"), "utf8")
      );
      const bad: string[] = [];
      const walk = (node: unknown, path: string) => {
        if (typeof node === "string") {
          const out = unencodable(node);
          if (out.length) bad.push(`${path}: ${JSON.stringify(node)}`);
          return;
        }
        if (node && typeof node === "object") {
          for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
        }
      };
      walk(bundle, "");
      expect(bad, `${locale}/pdf.json carries text Helvetica cannot encode`).toEqual([]);
    }
  });
});
