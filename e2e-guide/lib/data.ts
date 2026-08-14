import { LOCALE } from "./locale";

/**
 * The fictional business filmed in the guide. One shared cast of names keeps
 * the chapters coherent: the product created in chapter 03 is the one sold at
 * the till in chapter 06 and re-ordered from the supplier in chapter 07.
 *
 * Two kinds of string live here, and they behave differently across languages.
 *
 * A **name** does not translate. An Algerian company is called "Électro Souk"
 * in an English video too, its client is "SARL Atlas Distribution", its
 * supplier is "Condor Electronics Distribution", and its address is copied off
 * an envelope rather than rendered into another language. Identifiers, phone
 * numbers, references, barcodes and prices are facts of the same kind.
 *
 * A **description** does translate. "Téléviseur LED 43\" Condor" in an English
 * interface is the giveaway that the video was filmed once and relabelled: the
 * brand stays, the noun does not. The same goes for the category, the expense
 * labels, the stock-movement reasons and the words "Magasin" and "Dépôt" in
 * the location names — Alger-Centre and Rouiba are places, "shop" and
 * "warehouse" are not.
 */
const TEXT = {
  fr: {
    tv: 'Téléviseur LED 43" Condor',
    cable: "Câble HDMI 2.1 - 2 m",
    install: "Installation & mise en service à domicile",
    installSearch: "Installation",
    category: "Électroménager",
    shop: "Magasin Alger-Centre",
    warehouse: "Dépôt Rouiba",
    rent: "Loyer du local commercial",
    rentMonthly: "Mensualité — local commercial",
    supplies: "Achat de fournitures",
    fuelDay: "Carburant — tournée du jour",
    fuelInstall: "Carburant — tournée d'installations",
    register: "Caisse principale",
    restock: "Réception complémentaire fournisseur",
    returned: "Téléviseur retourné (emballage ouvert)",
    buyerRole: "Responsable achats",
  },
  en: {
    tv: '43" Condor LED TV',
    cable: "HDMI 2.1 cable - 2 m",
    install: "Home installation & setup",
    installSearch: "installation",
    category: "Home appliances",
    shop: "Alger-Centre shop",
    warehouse: "Rouiba warehouse",
    rent: "Shop rent",
    rentMonthly: "Monthly instalment — shop premises",
    supplies: "Office supplies",
    fuelDay: "Fuel — day's rounds",
    fuelInstall: "Fuel — installation rounds",
    register: "Main till",
    restock: "Additional supplier delivery",
    returned: "Television returned (box opened)",
    buyerRole: "Head of purchasing",
  },
  ar: {
    tv: "تلفزيون Condor LED 43 بوصة",
    cable: "كابل HDMI 2.1 - مترين",
    install: "التركيب والتشغيل في المنزل",
    installSearch: "التركيب",
    category: "الأجهزة الكهرومنزلية",
    shop: "محل الجزائر الوسطى",
    warehouse: "مستودع الرويبة",
    rent: "إيجار المحل التجاري",
    rentMonthly: "قسط شهري — المحل التجاري",
    supplies: "شراء لوازم",
    fuelDay: "وقود — جولة اليوم",
    fuelInstall: "وقود — جولة التركيبات",
    register: "الصندوق الرئيسي",
    restock: "استلام إضافي من المورد",
    returned: "تلفزيون مُرجَع (العلبة مفتوحة)",
    buyerRole: "مسؤول المشتريات",
  },
}[LOCALE];

export const BIZ = {
  company: "Électro Souk",
  owner: "Karim Benali",
  username: "karim",
  password: "Probook2026!",
  email: "contact@electro-souk.dz",
};

export const CLIENT = {
  name: "SARL Atlas Distribution",
  email: "achats@atlas-distribution.dz",
  phone: "0551 23 45 67",
  address: "12 rue Didouche Mourad",
  city: "Alger",
  postalCode: "16000",
  // Algerian company identifiers (stored in vat_number / siret / nis).
  nif: "099916001234567",
  rc: "16/00-0987654 B 11",
  nis: "0016098765432",
};

export const CLIENT_2 = {
  name: "EURL Numidia Store",
  email: "contact@numidia-store.dz",
  phone: "0661 98 76 54",
  city: "Oran",
};

/** The buyer at CLIENT, added in chapter 02. */
export const CONTACT = {
  name: "Yacine Hamdi",
  role: TEXT.buyerRole,
  email: "y.hamdi@atlas-distribution.dz",
  phone: "0770 45 12 89",
};

export const PRODUCTS = {
  tv: {
    designation: TEXT.tv,
    reference: "TV-COND-43",
    barcode: "6130000123456",
    salePrice: "42000",
    purchasePrice: "33000",
    quantity: "12",
    /** Typed into search boxes; a brand, so it matches in every language. */
    search: "Condor",
  },
  cable: {
    designation: TEXT.cable,
    reference: "ACC-HDMI-2M",
    barcode: "6130000987654",
    salePrice: "1800",
    purchasePrice: "950",
    quantity: "60",
    search: "HDMI",
  },
  install: {
    designation: TEXT.install,
    reference: "SRV-INSTALL",
    salePrice: "5000",
    // No brand to key on, so the fragment is translated with the name.
    search: TEXT.installSearch,
  },
};

export const CATEGORY = TEXT.category;

export const SUPPLIER = {
  name: "Condor Electronics Distribution",
  email: "commercial@condor-dist.dz",
  phone: "0770 11 22 33",
  address: "Zone industrielle, Bordj Bou Arréridj",
};

export const LOCATIONS = {
  shop: TEXT.shop,
  warehouse: TEXT.warehouse,
};

export const EXPENSE = {
  name: TEXT.rent,
  amount: "45000",
};

/** Descriptive labels the chapters type into forms. */
export const LABELS = {
  rentMonthly: TEXT.rentMonthly,
  supplies: TEXT.supplies,
  fuelDay: TEXT.fuelDay,
  fuelInstall: TEXT.fuelInstall,
  register: TEXT.register,
  restock: TEXT.restock,
  returned: TEXT.returned,
};
