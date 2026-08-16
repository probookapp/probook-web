/**
 * What an offer can include, and which part of the API each key covers.
 *
 * Two axes are easy to confuse and must not be merged. A **permission** says
 * who on the team may touch a module — the cashier does not see the reports.
 * An **entitlement**, defined here, says whether the business bought that
 * module at all. A single-user shop with the top offer has every entitlement
 * and only one set of permissions; a ten-person shop on the entry offer has the
 * reverse.
 *
 * CARE WHEN CREATING ONE OF THESE FOR REAL. The resolution order in
 * `feature-gate.ts` is default-allow only while the flag does not exist. The
 * moment a flag exists with `isGlobal = false`, every tenant is refused unless
 * their active subscription's plan links it, or they hold a tenant override —
 * so creating a flag before the offers carry it revokes the feature from every
 * paying customer at once. It has already happened once here, to a test
 * database, and eight suites went red.
 *
 * Nothing in this file creates anything. It names the keys the code gates on,
 * so the route and the flag a platform admin creates cannot drift apart.
 */
export const FEATURE_KEYS = {
  /** Counter sales: registers, sessions, tickets, the Z report. */
  POS: "pos",
  /** Suppliers, purchase orders, receipts, supplier credit. */
  PURCHASING: "purchasing",
  /** Delivery notes. */
  DELIVERY_NOTES: "delivery_notes",
  /** Expenses and the categories they are filed under. */
  EXPENSES: "expenses",
  /** Locations and stock transfers between them. */
  MULTI_LOCATION: "multi_location",
  /** Accounting export, VAT summary, pipeline, spend by category. */
  ADVANCED_REPORTS: "advanced_reports",
  /** Automatic payment reminders. */
  REMINDERS: "reminders",
  /** The phonebook and several contacts per client. */
  PHONEBOOK: "phonebook",
  /** Spreadsheet import, and backup export/restore. */
  IMPORT_EXPORT: "import_export",
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

/**
 * Which API paths belong to which entitlement, longest prefix first.
 *
 * The gate lives in one place — `withAuth` reads this table — rather than in
 * each handler. Fifty-five route files carry these modules, and the version of
 * this that gated two of them by hand left the rest open: a tenant without the
 * multi-site offer could not create a location but could still transfer stock
 * through another endpoint, which is not a restriction, only a nuisance.
 *
 * Reads are never gated (see `withAuth`): a business that moves to a smaller
 * offer keeps its history readable. It simply cannot add to it.
 */
const GATED_PREFIXES: ReadonlyArray<readonly [string, FeatureKey]> = [
  ["/api/pos", FEATURE_KEYS.POS],
  ["/api/purchases", FEATURE_KEYS.PURCHASING],
  ["/api/suppliers", FEATURE_KEYS.PURCHASING],
  ["/api/product-suppliers", FEATURE_KEYS.PURCHASING],
  ["/api/delivery-notes", FEATURE_KEYS.DELIVERY_NOTES],
  ["/api/expenses", FEATURE_KEYS.EXPENSES],
  ["/api/expense-categories", FEATURE_KEYS.EXPENSES],
  ["/api/locations", FEATURE_KEYS.MULTI_LOCATION],
  ["/api/stock-transfers", FEATURE_KEYS.MULTI_LOCATION],
  ["/api/reminders", FEATURE_KEYS.REMINDERS],
  ["/api/contacts", FEATURE_KEYS.PHONEBOOK],
  ["/api/import", FEATURE_KEYS.IMPORT_EXPORT],
  ["/api/export", FEATURE_KEYS.IMPORT_EXPORT],
];

/**
 * The reports that belong to the advanced offer. The rest of /api/reports —
 * revenue, margin, VAT — comes with every offer, so the module cannot be gated
 * by prefix alone.
 */
const GATED_REPORTS = [
  "/api/reports/accounting-export",
  "/api/reports/tax-summary",
  "/api/reports/pipeline",
  "/api/reports/expenses-by-category",
  "/api/reports/supplier-spend",
];

/** The entitlement a request needs, or null when the path is not gated. */
export function featureForPath(pathname: string): FeatureKey | null {
  if (GATED_REPORTS.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return FEATURE_KEYS.ADVANCED_REPORTS;
  }
  for (const [prefix, feature] of GATED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return feature;
  }
  return null;
}

/** Every key, for the entitlements endpoint and the seed. */
export const ALL_FEATURE_KEYS: readonly FeatureKey[] = Object.values(FEATURE_KEYS);
