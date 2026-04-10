/**
 * Shared import column definitions for all entity types.
 * Each column has an internal key, localized display names, and whether it's required.
 * Used by:
 *  - Frontend: to display column info and generate localized templates
 *  - Backend: to map any localized header back to the internal key
 */

export interface ImportColumn {
  key: string;
  required: boolean;
  labels: {
    en: string;
    fr: string;
    ar: string;
  };
}

// ========== Products ==========

export const productColumns: ImportColumn[] = [
  {
    key: "designation",
    required: true,
    labels: {
      en: "Product Name",
      fr: "Nom du produit",
      ar: "اسم المنتج",
    },
  },
  {
    key: "unit_price",
    required: true,
    labels: {
      en: "Selling Price excl. Tax",
      fr: "Prix de vente HT",
      ar: "سعر البيع بدون ضريبة",
    },
  },
  {
    key: "description",
    required: false,
    labels: {
      en: "Description",
      fr: "Description",
      ar: "الوصف",
    },
  },
  {
    key: "tax_rate",
    required: false,
    labels: {
      en: "Tax Rate (%)",
      fr: "Taux TVA (%)",
      ar: "معدل الضريبة (%)",
    },
  },
  {
    key: "unit",
    required: false,
    labels: {
      en: "Unit",
      fr: "Unite",
      ar: "الوحدة",
    },
  },
  {
    key: "reference",
    required: false,
    labels: {
      en: "Reference",
      fr: "Reference",
      ar: "المرجع",
    },
  },
  {
    key: "barcode",
    required: false,
    labels: {
      en: "Barcode",
      fr: "Code-barres",
      ar: "الرمز الشريطي",
    },
  },
  {
    key: "is_service",
    required: false,
    labels: {
      en: "Is a Service (true/false)",
      fr: "Est un service (true/false)",
      ar: "خدمة (true/false)",
    },
  },
  {
    key: "quantity",
    required: false,
    labels: {
      en: "Stock Quantity",
      fr: "Quantite en stock",
      ar: "الكمية في المخزون",
    },
  },
  {
    key: "purchase_price",
    required: false,
    labels: {
      en: "Purchase Price excl. Tax",
      fr: "Prix d'achat HT",
      ar: "سعر الشراء بدون ضريبة",
    },
  },
];

// ========== Clients ==========

export const clientColumns: ImportColumn[] = [
  {
    key: "name",
    required: true,
    labels: {
      en: "Client Name",
      fr: "Nom du client",
      ar: "اسم العميل",
    },
  },
  {
    key: "email",
    required: false,
    labels: {
      en: "Email",
      fr: "Email",
      ar: "البريد الإلكتروني",
    },
  },
  {
    key: "phone",
    required: false,
    labels: {
      en: "Phone Number",
      fr: "Numero de telephone",
      ar: "رقم الهاتف",
    },
  },
  {
    key: "address",
    required: false,
    labels: {
      en: "Address",
      fr: "Adresse",
      ar: "العنوان",
    },
  },
  {
    key: "city",
    required: false,
    labels: {
      en: "City",
      fr: "Ville",
      ar: "المدينة",
    },
  },
  {
    key: "postal_code",
    required: false,
    labels: {
      en: "Postal Code",
      fr: "Code postal",
      ar: "الرمز البريدي",
    },
  },
  {
    key: "country",
    required: false,
    labels: {
      en: "Country",
      fr: "Pays",
      ar: "البلد",
    },
  },
  {
    key: "siret",
    required: false,
    labels: {
      en: "SIRET Number",
      fr: "Numero SIRET",
      ar: "رقم SIRET",
    },
  },
  {
    key: "vat_number",
    required: false,
    labels: {
      en: "VAT Number",
      fr: "Numero TVA",
      ar: "رقم الضريبة",
    },
  },
  {
    key: "notes",
    required: false,
    labels: {
      en: "Notes",
      fr: "Notes",
      ar: "ملاحظات",
    },
  },
];

// ========== Suppliers ==========

export const supplierColumns: ImportColumn[] = [
  {
    key: "name",
    required: true,
    labels: {
      en: "Supplier Name",
      fr: "Nom du fournisseur",
      ar: "اسم المورد",
    },
  },
  {
    key: "email",
    required: false,
    labels: {
      en: "Email",
      fr: "Email",
      ar: "البريد الإلكتروني",
    },
  },
  {
    key: "phone",
    required: false,
    labels: {
      en: "Phone Number",
      fr: "Numero de telephone",
      ar: "رقم الهاتف",
    },
  },
  {
    key: "address",
    required: false,
    labels: {
      en: "Address",
      fr: "Adresse",
      ar: "العنوان",
    },
  },
  {
    key: "notes",
    required: false,
    labels: {
      en: "Notes",
      fr: "Notes",
      ar: "ملاحظات",
    },
  },
];

// ========== Helpers ==========

const allColumns = [...productColumns, ...clientColumns, ...supplierColumns];

/**
 * Build a reverse lookup: lowercased localized label -> internal key.
 * This allows the backend to accept headers in any language.
 */
function buildHeaderMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const col of allColumns) {
    // Map the internal key itself
    map.set(col.key, col.key);
    // Map each localized label
    for (const label of Object.values(col.labels)) {
      map.set(label.toLowerCase(), col.key);
    }
  }
  return map;
}

const headerMap = buildHeaderMap();

/**
 * Given a header string (from CSV/XLSX), return the internal column key.
 * Returns undefined if no match is found.
 */
export function resolveHeader(header: string): string | undefined {
  return headerMap.get(header.trim().toLowerCase());
}

/**
 * Get columns for an entity type.
 */
export function getColumnsForEntity(entityType: "clients" | "products" | "suppliers"): ImportColumn[] {
  switch (entityType) {
    case "products": return productColumns;
    case "clients": return clientColumns;
    case "suppliers": return supplierColumns;
  }
}

/**
 * Get localized column labels for an entity type.
 */
export function getLocalizedHeaders(
  entityType: "clients" | "products" | "suppliers",
  locale: string,
): string[] {
  const lang = (locale.startsWith("ar") ? "ar" : locale.startsWith("fr") ? "fr" : "en") as "en" | "fr" | "ar";
  return getColumnsForEntity(entityType).map((col) => col.labels[lang]);
}
