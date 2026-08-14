import type { Expense, ExpenseCategory } from "@/types";

const now = "2026-03-20T10:00:00.000Z";

/**
 * Headings a small installer would actually keep: the demo has to show the
 * per-heading report with something in it, not an empty breakdown.
 */
export const DEMO_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: "demo-expense-cat-001", name: "Loyer", expense_count: 1 },
  { id: "demo-expense-cat-002", name: "Téléphone et internet", expense_count: 1 },
  { id: "demo-expense-cat-003", name: "Fournitures", expense_count: 1 },
  { id: "demo-expense-cat-004", name: "Carburant", expense_count: 2 },
  { id: "demo-expense-cat-005", name: "Logiciels", expense_count: 1 },
];

const category = (id: string) => {
  const found = DEMO_EXPENSE_CATEGORIES.find((c) => c.id === id);
  return found ? { id: found.id, name: found.name } : null;
};

export const DEMO_EXPENSES: Expense[] = [
  {
    id: "demo-expense-001",
    name: "Loyer du local — mars",
    amount: 45000,
    date: "2026-03-01",
    notes: "Loyer mensuel de l'atelier",
    category_id: "demo-expense-cat-001",
    category: category("demo-expense-cat-001"),
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-expense-002",
    name: "Abonnement internet",
    amount: 4500,
    date: "2026-03-05",
    notes: null,
    category_id: "demo-expense-cat-002",
    category: category("demo-expense-cat-002"),
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-expense-003",
    name: "Fournitures de bureau",
    amount: 8200,
    date: "2026-03-10",
    notes: "Papier, cartouches d'encre, classeurs",
    category_id: "demo-expense-cat-003",
    category: category("demo-expense-cat-003"),
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-expense-004",
    name: "Carburant — tournée d'installations",
    amount: 6800,
    date: "2026-03-12",
    notes: null,
    category_id: "demo-expense-cat-004",
    category: category("demo-expense-cat-004"),
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-expense-005",
    name: "Carburant — livraisons",
    amount: 5400,
    date: "2026-03-15",
    notes: "Plein du fourgon",
    category_id: "demo-expense-cat-004",
    category: category("demo-expense-cat-004"),
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-expense-006",
    name: "Renouvellement de licence logicielle",
    amount: 12000,
    date: "2026-03-18",
    notes: "Licence annuelle des outils de dessin",
    category_id: "demo-expense-cat-005",
    category: category("demo-expense-cat-005"),
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-expense-007",
    name: "Repas d'affaires",
    amount: 3500,
    date: "2026-03-19",
    notes: "Rendez-vous client",
    // Deliberately left unfiled: the report has to show the "no heading" bucket.
    category_id: null,
    category: null,
    created_at: now,
    updated_at: now,
  },
];
