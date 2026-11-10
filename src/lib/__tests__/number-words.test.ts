import { describe, expect, it } from "vitest";
import { numberToArabicWords, numberToFrenchWords } from "../number-words";
import { documentAmountInWords } from "@/features/pdf/amount-in-words";

const dz = (n: number) => numberToArabicWords(n, "دينار جزائري", "سنتيم");

describe("numberToArabicWords", () => {
  it("writes units, teens and tens", () => {
    expect(dz(1)).toBe("واحد دينار جزائري");
    expect(dz(11)).toBe("أحد عشر دينار جزائري");
    expect(dz(12)).toBe("اثنا عشر دينار جزائري");
    expect(dz(15)).toBe("خمسة عشر دينار جزائري");
    expect(dz(25)).toBe("خمسة وعشرون دينار جزائري");
    expect(dz(90)).toBe("تسعون دينار جزائري");
  });

  it("writes hundreds and thousands with their dual and plural", () => {
    expect(dz(200)).toBe("مائتان دينار جزائري");
    expect(dz(1000)).toBe("ألف دينار جزائري");
    expect(dz(2000)).toBe("ألفان دينار جزائري");
    expect(dz(3000)).toBe("ثلاثة آلاف دينار جزائري");
    expect(dz(10000)).toBe("عشرة آلاف دينار جزائري");
    expect(dz(11000)).toBe("أحد عشر ألف دينار جزائري");
    expect(dz(103000)).toBe("مائة وثلاثة آلاف دينار جزائري");
    expect(dz(74970)).toBe("أربعة وسبعون ألف وتسعمائة وسبعون دينار جزائري");
  });

  it("writes millions and billions", () => {
    expect(dz(1_000_000)).toBe("مليون دينار جزائري");
    expect(dz(3_000_000)).toBe("ثلاثة ملايين دينار جزائري");
    expect(dz(2_500_000_000)).toBe("ملياران وخمسمائة مليون دينار جزائري");
  });

  it("adds the centimes, and rounds before splitting", () => {
    expect(dz(1234.56)).toBe("ألف ومائتان وأربعة وثلاثون دينار جزائري وستة وخمسون سنتيم");
    expect(dz(1.995)).toBe("اثنان دينار جزائري");
    expect(dz(0)).toBe("صفر دينار جزائري");
    expect(dz(-5)).toBe("ناقص خمسة دينار جزائري");
  });
});

describe("currencies with millimes", () => {
  it("reads three decimals as millimes, not centimes", () => {
    expect(numberToFrenchWords(1.5, "dinar", "millime", 3)).toBe("Un dinar et cinq cents millimes");
    expect(numberToArabicWords(0.5, "دينار تونسي", "مليم", 3)).toBe("صفر دينار تونسي وخمسمائة مليم");
  });
});

describe("documentAmountInWords", () => {
  it("speaks the document's language, French only where English is mandated", () => {
    expect(documentAmountInWords(10, "DZD", "ar", true)).toEqual({ labelLocale: "ar", text: "عشرة دينار جزائري" });
    expect(documentAmountInWords(10, "EUR", "fr", false)?.text).toBe("Dix euros");
    expect(documentAmountInWords(10, "DZD", "en", true)?.labelLocale).toBe("fr");
    expect(documentAmountInWords(10, "EUR", "en", false)).toBeNull();
    expect(documentAmountInWords(1.5, "TND", "fr", false)?.text).toBe("Un dinar et cinq cents millimes");
  });
});
