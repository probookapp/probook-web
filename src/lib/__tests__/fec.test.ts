import { describe, expect, it } from "vitest";
import { ACCOUNTS, auxNum, balance, encodeIso885915, FEC_COLUMNS, fecFileName, serializeFec, type FecEntry } from "../fec";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

const sale: FecEntry = {
  journal: "VE",
  date: day("2026-03-05"),
  pieceRef: "FAC-1",
  pieceDate: day("2026-03-05"),
  lines: [
    { account: ACCOUNTS.clients, aux: { num: "C1", lib: "Dupont & Fils" }, label: "Facture FAC-1", debit: 120, credit: 0 },
    { account: ACCOUNTS.salesGoods, label: "HT", debit: 0, credit: 100 },
    { account: ACCOUNTS.vatCollected, label: "TVA", debit: 0, credit: 20 },
  ],
};

describe("FEC", () => {
  it("writes the 18 columns in the legal order, tab-separated", () => {
    const [header, first] = serializeFec([sale], "EUR").split("\r\n");
    expect(header.split("\t")).toEqual([...FEC_COLUMNS]);
    const cols = first.split("\t");
    expect(cols).toHaveLength(18);
    expect(cols.slice(0, 5)).toEqual(["VE", "Ventes", "VE000001", "20260305", "411000"]);
    expect(cols[6]).toBe("C1");
    expect(cols[11]).toBe("120,00");
    expect(cols[12]).toBe("0,00");
    expect(cols[15]).toBe("20260305");
    // Euro books leave the currency columns empty.
    expect(cols[16]).toBe("");
    expect(cols[17]).toBe("");
  });

  it("numbers each journal in its own continuous sequence, by date", () => {
    const later = { ...sale, date: day("2026-03-07"), pieceRef: "FAC-2", pieceDate: day("2026-03-07") };
    const bank: FecEntry = {
      journal: "BQ",
      date: day("2026-03-06"),
      pieceRef: "R1",
      pieceDate: day("2026-03-06"),
      lines: [
        { account: ACCOUNTS.bank, label: "x", debit: 120, credit: 0 },
        { account: ACCOUNTS.clients, label: "x", debit: 0, credit: 120 },
      ],
    };
    const nums = serializeFec([later, bank, sale], "EUR")
      .split("\r\n")
      .slice(1)
      .filter(Boolean)
      .map((r) => r.split("\t")[2]);
    expect([...new Set(nums)]).toEqual(["VE000001", "BQ000001", "VE000002"]);
  });

  it("puts a rounding cent on the short side so every écriture balances", () => {
    const fixed = balance({
      ...sale,
      lines: [
        { account: ACCOUNTS.clients, label: "x", debit: 100.01, credit: 0 },
        { account: ACCOUNTS.salesGoods, label: "x", debit: 0, credit: 83.34 },
        { account: ACCOUNTS.vatCollected, label: "x", debit: 0, credit: 16.66 },
      ],
    });
    const d = fixed.lines.reduce((s, l) => s + Math.round(l.debit * 100), 0);
    const c = fixed.lines.reduce((s, l) => s + Math.round(l.credit * 100), 0);
    expect(d).toBe(c);
    expect(fixed.lines[1].credit).toBe(83.35);
  });

  it("drops zero lines and keeps tabs and line breaks out of fields", () => {
    const out = serializeFec(
      [{ ...sale, lines: [...sale.lines, { account: ACCOUNTS.shipping, label: "zero", debit: 0, credit: 0 }], pieceRef: "A\tB\nC" }],
      "EUR"
    );
    expect(out).not.toContain("zero");
    expect(out.split("\r\n")[1].split("\t")[8]).toBe("A B C");
  });

  it("states amount and currency outside the euro", () => {
    const cols = serializeFec([sale], "DZD").split("\r\n")[1].split("\t");
    expect(cols[16]).toBe("120,00");
    expect(cols[17]).toBe("DZD");
  });

  it("encodes in ISO 8859-15, euro sign included", () => {
    expect([...encodeIso885915("é€œ")]).toEqual([0xe9, 0xa4, 0xbd]);
    expect([...encodeIso885915("ك")]).toEqual([0x3f]);
  });

  it("names the file SIREN + FEC + closing date", () => {
    expect(fecFileName("123 456 789 00012", day("2026-12-31"))).toBe("123456789FEC20261231.txt");
    expect(auxNum("C", "ab12-cd34-ef56")).toBe("CAB12CD34EF");
  });
});
