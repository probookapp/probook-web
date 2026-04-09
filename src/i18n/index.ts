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
  },
};

// i18n initializes with 'en' as default. The Providers component sets the
// correct language from the URL [locale] segment before any child renders.
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
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
    ],
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
