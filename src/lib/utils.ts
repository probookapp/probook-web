import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import i18n from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { DEFAULT_CURRENCY } from "./currencies";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getLocale(): string {
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
  const currency = useSettingsStore.getState().currency || DEFAULT_CURRENCY;
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

/** A date with its time (day/month/year hour:minute) in the app's language. */
/** Intl adds direction marks around Arabic dates; they break copy and print. */
const DIRECTION_MARKS = /[‎‏‪-‮]/g;

/**
 * Date and time in the app's language. Always a 24-hour clock: a business
 * ledger reads "14:05" in every language, and the Arabic "م"/"ص" markers do not
 * survive a thermal printer.
 */
export function formatDateTime(date: string | number | Date | null | undefined): string {
  if (date === null || date === undefined || date === "") return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  const formatted = new Intl.DateTimeFormat(getLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(parsed);
  return formatted.replace(DIRECTION_MARKS, "");
}

/** Hour and minute in the app's language, 24-hour clock. */
export function formatTime(date: string | number | Date | null | undefined): string {
  if (date === null || date === undefined || date === "") return "-";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat(getLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(parsed)
    .replace(DIRECTION_MARKS, "");
}

/**
 * "17/11/2026 14:05" in plain ASCII, whatever the language: receipts go to
 * ESC/POS printers as raw bytes, and a localized date (an Arabic comma, a
 * narrow no-break space) prints as garbage there.
 */
export function formatReceiptDateTime(date: string | number | Date): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateISO(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * A stored date as a date field holds it. The API answers with a full
 * timestamp ("2026-10-08T00:00:00.000Z"), which a date input does not accept:
 * it showed empty, and the editor opened every document with no dates on screen.
 */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
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

// Re-exported for existing callers; the definitions moved somewhere a server
// render can import without dragging react-i18next in with them.
export { CURRENCY_WORDS, numberToFrenchWords } from "./number-words";
