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
  const currency = useSettingsStore.getState().currency || "DZD";
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

// Re-exported for existing callers; the definitions moved somewhere a server
// render can import without dragging react-i18next in with them.
export { CURRENCY_WORDS, numberToFrenchWords } from "./number-words";
