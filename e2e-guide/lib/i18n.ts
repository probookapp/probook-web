/**
 * The app's own strings, read straight from the locale bundle it renders.
 *
 * Selecting buttons by hard-coded text would silently rot the moment a label
 * changes; resolving through the same JSON the UI renders keeps the recording
 * script and the product in lockstep — and, since the bundle follows
 * GUIDE_LOCALE, lets one script drive the French, English and Arabic
 * interfaces without a line of it being rewritten.
 */
import { LOCALE } from "./locale";

import frCommon from "../../src/i18n/locales/fr/common.json";
import frNavigation from "../../src/i18n/locales/fr/navigation.json";
import frAuth from "../../src/i18n/locales/fr/auth.json";
import frClients from "../../src/i18n/locales/fr/clients.json";
import frProducts from "../../src/i18n/locales/fr/products.json";
import frQuotes from "../../src/i18n/locales/fr/quotes.json";
import frInvoices from "../../src/i18n/locales/fr/invoices.json";
import frDelivery from "../../src/i18n/locales/fr/delivery.json";
import frExpenses from "../../src/i18n/locales/fr/expenses.json";
import frPurchases from "../../src/i18n/locales/fr/purchases.json";
import frSuppliers from "../../src/i18n/locales/fr/suppliers.json";
import frLocations from "../../src/i18n/locales/fr/locations.json";
import frPos from "../../src/i18n/locales/fr/pos.json";
import frReports from "../../src/i18n/locales/fr/reports.json";
import frSettings from "../../src/i18n/locales/fr/settings.json";
import frDashboard from "../../src/i18n/locales/fr/dashboard.json";

import enCommon from "../../src/i18n/locales/en/common.json";
import enNavigation from "../../src/i18n/locales/en/navigation.json";
import enAuth from "../../src/i18n/locales/en/auth.json";
import enClients from "../../src/i18n/locales/en/clients.json";
import enProducts from "../../src/i18n/locales/en/products.json";
import enQuotes from "../../src/i18n/locales/en/quotes.json";
import enInvoices from "../../src/i18n/locales/en/invoices.json";
import enDelivery from "../../src/i18n/locales/en/delivery.json";
import enExpenses from "../../src/i18n/locales/en/expenses.json";
import enPurchases from "../../src/i18n/locales/en/purchases.json";
import enSuppliers from "../../src/i18n/locales/en/suppliers.json";
import enLocations from "../../src/i18n/locales/en/locations.json";
import enPos from "../../src/i18n/locales/en/pos.json";
import enReports from "../../src/i18n/locales/en/reports.json";
import enSettings from "../../src/i18n/locales/en/settings.json";
import enDashboard from "../../src/i18n/locales/en/dashboard.json";

import arCommon from "../../src/i18n/locales/ar/common.json";
import arNavigation from "../../src/i18n/locales/ar/navigation.json";
import arAuth from "../../src/i18n/locales/ar/auth.json";
import arClients from "../../src/i18n/locales/ar/clients.json";
import arProducts from "../../src/i18n/locales/ar/products.json";
import arQuotes from "../../src/i18n/locales/ar/quotes.json";
import arInvoices from "../../src/i18n/locales/ar/invoices.json";
import arDelivery from "../../src/i18n/locales/ar/delivery.json";
import arExpenses from "../../src/i18n/locales/ar/expenses.json";
import arPurchases from "../../src/i18n/locales/ar/purchases.json";
import arSuppliers from "../../src/i18n/locales/ar/suppliers.json";
import arLocations from "../../src/i18n/locales/ar/locations.json";
import arPos from "../../src/i18n/locales/ar/pos.json";
import arReports from "../../src/i18n/locales/ar/reports.json";
import arSettings from "../../src/i18n/locales/ar/settings.json";
import arDashboard from "../../src/i18n/locales/ar/dashboard.json";

const BY_LOCALE: Record<string, Record<string, unknown>> = {
  fr: {
    common: frCommon,
    navigation: frNavigation,
    auth: frAuth,
    clients: frClients,
    products: frProducts,
    quotes: frQuotes,
    invoices: frInvoices,
    delivery: frDelivery,
    expenses: frExpenses,
    purchases: frPurchases,
    suppliers: frSuppliers,
    locations: frLocations,
    pos: frPos,
    reports: frReports,
    settings: frSettings,
    dashboard: frDashboard,
  },
  en: {
    common: enCommon,
    navigation: enNavigation,
    auth: enAuth,
    clients: enClients,
    products: enProducts,
    quotes: enQuotes,
    invoices: enInvoices,
    delivery: enDelivery,
    expenses: enExpenses,
    purchases: enPurchases,
    suppliers: enSuppliers,
    locations: enLocations,
    pos: enPos,
    reports: enReports,
    settings: enSettings,
    dashboard: enDashboard,
  },
  ar: {
    common: arCommon,
    navigation: arNavigation,
    auth: arAuth,
    clients: arClients,
    products: arProducts,
    quotes: arQuotes,
    invoices: arInvoices,
    delivery: arDelivery,
    expenses: arExpenses,
    purchases: arPurchases,
    suppliers: arSuppliers,
    locations: arLocations,
    pos: arPos,
    reports: arReports,
    settings: arSettings,
    dashboard: arDashboard,
  },
};

const bundles = BY_LOCALE[LOCALE];

/**
 * Resolve "namespace:dotted.key" to its string in the filmed language.
 * Throws on a missing key — a silent "" would produce a selector that matches
 * everything and a video full of wrong clicks.
 */
export function t(key: string): string {
  const [ns, path] = key.includes(":") ? key.split(/:(.+)/) : ["common", key];
  let node: unknown = bundles[ns];
  if (node === undefined) throw new Error(`i18n: unknown namespace "${ns}" (${key})`);
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) {
      throw new Error(`i18n[${LOCALE}]: missing key "${key}"`);
    }
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== "string") throw new Error(`i18n[${LOCALE}]: missing key "${key}"`);
  return node;
}
