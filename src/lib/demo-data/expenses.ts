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

/**
 * Two people record expenses in the demo, so the per-employee view of the
 * expenses (list filter, report) has something to tell apart.
 */
const DEMO_EXPENSE_AUTHORS = {
  owner: { id: "demo-user-owner", display_name: "Yacine Haddad" },
  employee: { id: "demo-user-employee", display_name: "Karim Belkacem" },
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
    payment_method: "virement",
    created_by_id: DEMO_EXPENSE_AUTHORS.owner.id,
    created_by: DEMO_EXPENSE_AUTHORS.owner,
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
    payment_method: "prelevement",
    created_by_id: DEMO_EXPENSE_AUTHORS.owner.id,
    created_by: DEMO_EXPENSE_AUTHORS.owner,
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
    payment_method: "especes",
    created_by_id: DEMO_EXPENSE_AUTHORS.employee.id,
    created_by: DEMO_EXPENSE_AUTHORS.employee,
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
    payment_method: "especes",
    created_by_id: DEMO_EXPENSE_AUTHORS.employee.id,
    created_by: DEMO_EXPENSE_AUTHORS.employee,
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
    payment_method: "especes",
    created_by_id: DEMO_EXPENSE_AUTHORS.owner.id,
    created_by: DEMO_EXPENSE_AUTHORS.owner,
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
    payment_method: "carte",
    created_by_id: DEMO_EXPENSE_AUTHORS.owner.id,
    created_by: DEMO_EXPENSE_AUTHORS.owner,
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
    payment_method: "especes",
    created_by_id: DEMO_EXPENSE_AUTHORS.employee.id,
    created_by: DEMO_EXPENSE_AUTHORS.employee,
    created_at: now,
    updated_at: now,
  },
];
