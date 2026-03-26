import type { Expense } from "@/types";

const now = "2026-03-20T10:00:00.000Z";

export const DEMO_EXPENSES: Expense[] = [
  {
    id: "demo-expense-001",
    name: "Office Rent - March",
    amount: 45000,
    date: "2026-03-01",
    notes: "Monthly office rental",
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-expense-002",
    name: "Internet Subscription",
    amount: 4500,
    date: "2026-03-05",
    notes: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-expense-003",
    name: "Office Supplies",
    amount: 8200,
    date: "2026-03-10",
    notes: "Paper, ink cartridges, folders",
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-expense-004",
    name: "Business Lunch - Client Meeting",
    amount: 3500,
    date: "2026-03-15",
    notes: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-expense-005",
    name: "Software License Renewal",
    amount: 12000,
    date: "2026-03-18",
    notes: "Annual license for design tools",
    created_at: now,
    updated_at: now,
  },
];
