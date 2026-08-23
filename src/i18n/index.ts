import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// French translations
import frCommon from './locales/fr/common.json';
import frNavigation from './locales/fr/navigation.json';
import frDashboard from './locales/fr/dashboard.json';
import frClients from './locales/fr/clients.json';
import frProducts from './locales/fr/products.json';
import frQuotes from './locales/fr/quotes.json';
import frInvoices from './locales/fr/invoices.json';
import frDelivery from './locales/fr/delivery.json';
import frSettings from './locales/fr/settings.json';
import frReports from './locales/fr/reports.json';
import frValidation from './locales/fr/validation.json';
import frPdf from './locales/fr/pdf.json';
import frExpenses from './locales/fr/expenses.json';
import frSuppliers from './locales/fr/suppliers.json';
import frAuth from './locales/fr/auth.json';
import frPos from './locales/fr/pos.json';
import frAdmin from './locales/fr/admin.json';
import frPages from './locales/fr/pages.json';
import frPurchases from './locales/fr/purchases.json';
import frLocations from './locales/fr/locations.json';

// English translations
import enCommon from './locales/en/common.json';
import enNavigation from './locales/en/navigation.json';
import enDashboard from './locales/en/dashboard.json';
import enClients from './locales/en/clients.json';
import enProducts from './locales/en/products.json';
import enQuotes from './locales/en/quotes.json';
import enInvoices from './locales/en/invoices.json';
import enDelivery from './locales/en/delivery.json';
import enSettings from './locales/en/settings.json';
import enReports from './locales/en/reports.json';
import enValidation from './locales/en/validation.json';
import enPdf from './locales/en/pdf.json';
import enExpenses from './locales/en/expenses.json';
import enSuppliers from './locales/en/suppliers.json';
import enAuth from './locales/en/auth.json';
import enPos from './locales/en/pos.json';
import enAdmin from './locales/en/admin.json';
import enPages from './locales/en/pages.json';
import enPurchases from './locales/en/purchases.json';
import enLocations from './locales/en/locations.json';

// Arabic translations
import arCommon from './locales/ar/common.json';
import arNavigation from './locales/ar/navigation.json';
import arDashboard from './locales/ar/dashboard.json';
import arClients from './locales/ar/clients.json';
import arProducts from './locales/ar/products.json';
import arQuotes from './locales/ar/quotes.json';
import arInvoices from './locales/ar/invoices.json';
import arDelivery from './locales/ar/delivery.json';
import arSettings from './locales/ar/settings.json';
import arReports from './locales/ar/reports.json';
import arValidation from './locales/ar/validation.json';
import arPdf from './locales/ar/pdf.json';
import arExpenses from './locales/ar/expenses.json';
import arSuppliers from './locales/ar/suppliers.json';
import arAuth from './locales/ar/auth.json';
import arPos from './locales/ar/pos.json';
import arAdmin from './locales/ar/admin.json';
import arPages from './locales/ar/pages.json';
import arPurchases from './locales/ar/purchases.json';
import arLocations from './locales/ar/locations.json';

const resources = {
  fr: {
    common: frCommon,
    navigation: frNavigation,
    dashboard: frDashboard,
    clients: frClients,
    products: frProducts,
    quotes: frQuotes,
    invoices: frInvoices,
    delivery: frDelivery,
    settings: frSettings,
    reports: frReports,
    validation: frValidation,
    pdf: frPdf,
    expenses: frExpenses,
    suppliers: frSuppliers,
    auth: frAuth,
    pos: frPos,
    admin: frAdmin,
    pages: frPages,
    purchases: frPurchases,
    locations: frLocations,
  },
  en: {
    common: enCommon,
    navigation: enNavigation,
    dashboard: enDashboard,
    clients: enClients,
    products: enProducts,
    quotes: enQuotes,
    invoices: enInvoices,
    delivery: enDelivery,
    settings: enSettings,
    reports: enReports,
    validation: enValidation,
    pdf: enPdf,
    expenses: enExpenses,
    suppliers: enSuppliers,
    auth: enAuth,
    pos: enPos,
    admin: enAdmin,
    pages: enPages,
    purchases: enPurchases,
    locations: enLocations,
  },
  ar: {
    common: arCommon,
    navigation: arNavigation,
    dashboard: arDashboard,
    clients: arClients,
    products: arProducts,
    quotes: arQuotes,
    invoices: arInvoices,
    delivery: arDelivery,
    settings: arSettings,
    reports: arReports,
    validation: arValidation,
    pdf: arPdf,
    expenses: arExpenses,
    suppliers: arSuppliers,
    auth: arAuth,
    pos: arPos,
    admin: arAdmin,
    pages: arPages,
    purchases: arPurchases,
    locations: arLocations,
  },
};

/**
 * Every key i18next could not resolve, in the order it was asked for.
 *
 * A miss is silent by construction: i18next returns the key path, so the page
 * renders "status.partiallyPaid" where a label belongs and nothing throws. The
 * static test in ./__tests__/key-usage.test.ts catches the literal keys; this
 * catches the computed ones — `t(`status:${row.state}`)` is only wrong for the
 * values that actually occur, which no scan of the source can enumerate.
 *
 * Left on in every build rather than gated behind a test flag: a detector that
 * has to be switched on is a detector that is off when it matters, and CI runs
 * the suite against a production build. The cap keys the cost at nothing —
 * a missing key inside a list would otherwise push once per row, forever.
 */
const MISSING_LIMIT = 50;

declare global {
  interface Window {
    __I18N_MISSING__?: string[];
  }
}

// i18n initializes with 'en' as default. The Providers component sets the
// correct language from the URL [locale] segment before any child renders.
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    saveMissing: true,
    missingKeyHandler: (_languages, ns, key) => {
      if (typeof window === 'undefined') return;
      const seen = (window.__I18N_MISSING__ ??= []);
      // The handler is called with the *fallback* language (saveMissingTo
      // defaults to 'fallback'); what matters for a bug report is the language
      // the reader had on screen.
      const entry = `${i18n.resolvedLanguage ?? i18n.language}/${ns}:${key}`;
      if (seen.length < MISSING_LIMIT && !seen.includes(entry)) seen.push(entry);
    },
    ns: [
      'common',
      'navigation',
      'dashboard',
      'clients',
      'products',
      'quotes',
      'invoices',
      'delivery',
      'settings',
      'reports',
      'validation',
      'pdf',
      'expenses',
      'suppliers',
      'auth',
      'pos',
      'admin',
      'pages',
      'purchases',
      'locations',
    ],
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
