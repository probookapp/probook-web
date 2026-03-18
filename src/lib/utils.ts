import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import i18n from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getLocale(): string {
  const lang = i18n.language || "fr";
  // Map language codes to locale codes
  // Use -u-nu-latn for Arabic to keep Western/Latin numerals
  const localeMap: Record<string, string> = {
    fr: "fr-FR",
    en: "en-US",
    ar: "ar-SA-u-nu-latn",
  };
  return localeMap[lang] || "fr-FR";
}

export function formatCurrency(amount: number | null | undefined): string {
  const safeAmount = typeof amount === "number" && !Number.isNaN(amount) ? amount : 0;
  const currency = useSettingsStore.getState().currency || "EUR";
  return new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency,
  }).format(safeAmount);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  const formatted = new Intl.DateTimeFormat(getLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
  // Remove RTL/LTR marks that Arabic locale adds
  return formatted.replace(/[\u200E\u200F\u202A-\u202E]/g, "");
}

export function formatDateISO(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function calculateLineTotal(
  quantity: number,
  unitPrice: number,
  taxRate: number
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = quantity * unitPrice;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  return { subtotal, taxAmount, total };
}

export function generateQuoteNumber(prefix: string, nextNumber: number): string {
  const year = new Date().getFullYear();
  const paddedNumber = String(nextNumber).padStart(4, "0");
  return `${prefix}${year}-${paddedNumber}`;
}

export function generateInvoiceNumber(prefix: string, nextNumber: number): string {
  const year = new Date().getFullYear();
  const paddedNumber = String(nextNumber).padStart(4, "0");
  return `${prefix}${year}-${paddedNumber}`;
}

// French number to words conversion
const UNITS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function convertHundreds(n: number): string {
  if (n === 0) return '';

  let result = '';
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;

  if (hundreds > 0) {
    if (hundreds === 1) {
      result = 'cent';
    } else {
      result = UNITS[hundreds] + ' cent';
    }
    if (remainder === 0 && hundreds > 1) {
      result += 's';
    }
    if (remainder > 0) {
      result += ' ';
    }
  }

  if (remainder > 0) {
    if (remainder < 20) {
      result += UNITS[remainder];
    } else {
      const tensDigit = Math.floor(remainder / 10);
      const unitDigit = remainder % 10;

      if (tensDigit === 7 || tensDigit === 9) {
        // 70-79 uses soixante-dix, 90-99 uses quatre-vingt-dix
        const base = tensDigit === 7 ? 6 : 8;
        const added = tensDigit === 7 ? 10 + unitDigit : 10 + unitDigit;
        result += TENS[base];
        if (added === 11 && tensDigit === 7) {
          result += ' et onze';
        } else {
          result += '-' + UNITS[added];
        }
      } else if (tensDigit === 8) {
        result += TENS[8];
        if (unitDigit === 0) {
          result += 's';
        } else {
          result += '-' + UNITS[unitDigit];
        }
      } else {
        result += TENS[tensDigit];
        if (unitDigit === 1 && tensDigit !== 8) {
          result += ' et un';
        } else if (unitDigit > 0) {
          result += '-' + UNITS[unitDigit];
        }
      }
    }
  }

  return result;
}

function convertThousands(n: number): string {
  if (n === 0) return 'zéro';
  if (n < 0) return 'moins ' + convertThousands(-n);

  let result = '';

  // Millions
  const millions = Math.floor(n / 1000000);
  if (millions > 0) {
    if (millions === 1) {
      result += 'un million';
    } else {
      result += convertHundreds(millions) + ' millions';
    }
    n %= 1000000;
    if (n > 0) result += ' ';
  }

  // Thousands
  const thousands = Math.floor(n / 1000);
  if (thousands > 0) {
    if (thousands === 1) {
      result += 'mille';
    } else {
      result += convertHundreds(thousands) + ' mille';
    }
    n %= 1000;
    if (n > 0) result += ' ';
  }

  // Hundreds
  if (n > 0) {
    result += convertHundreds(n);
  }

  return result;
}

export const CURRENCY_WORDS: Record<string, { main: string; sub: string }> = {
  EUR: { main: "euro", sub: "centime" },
  USD: { main: "dollar", sub: "cent" },
  GBP: { main: "livre sterling", sub: "penny" },
  DZD: { main: "dinar", sub: "centime" },
  MAD: { main: "dirham", sub: "centime" },
  TND: { main: "dinar", sub: "millime" },
  CAD: { main: "dollar canadien", sub: "cent" },
  CHF: { main: "franc", sub: "centime" },
};

export function numberToFrenchWords(
  amount: number,
  mainUnit: string = "euro",
  subUnit: string = "centime"
): string {
  const whole = Math.floor(amount);
  const fractional = Math.round((amount - whole) * 100);

  let result = '';

  if (whole === 0) {
    result = `zéro ${mainUnit}`;
  } else if (whole === 1) {
    result = `un ${mainUnit}`;
  } else {
    result = convertThousands(whole) + ' ' + mainUnit + 's';
  }

  if (fractional > 0) {
    result += ' et ';
    if (fractional === 1) {
      result += `un ${subUnit}`;
    } else {
      result += convertThousands(fractional) + ' ' + subUnit + 's';
    }
  }

  // Capitalize first letter
  return result.charAt(0).toUpperCase() + result.slice(1);
}
