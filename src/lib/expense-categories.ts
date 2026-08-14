/**
 * Suggested expense headings.
 *
 * These are only suggestions: the list is offered in the expense form so the
 * recurring charges most businesses have (fuel, rent, salaries…) are one click
 * away instead of being retyped — and retyped slightly differently every month,
 * which is what makes a flat expense list impossible to analyse.
 *
 * Picking one creates a real category row for the tenant. Nothing here is
 * seeded up front: a business that never buys fuel never gets a fuel heading.
 * Free text still works, so the list constrains nothing.
 */
export const EXPENSE_CATEGORY_SUGGESTIONS = [
  "fuel",
  "rent",
  "salaries",
  "electricity",
  "water",
  "phoneInternet",
  "insurance",
  "vehicleMaintenance",
  "supplies",
  "transport",
  "taxes",
  "bankFees",
  "advertising",
  "subcontracting",
  "training",
  "software",
] as const;

export type ExpenseCategorySuggestion = (typeof EXPENSE_CATEGORY_SUGGESTIONS)[number];

/** Longest heading a tenant may create — the column is text, the UI is not. */
export const EXPENSE_CATEGORY_MAX_LENGTH = 60;

/**
 * Headings are matched on their trimmed, whitespace-collapsed form so
 * "Carburant" and "Carburant " are the same heading rather than two.
 */
export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
