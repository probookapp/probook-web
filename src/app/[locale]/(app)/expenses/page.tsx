"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { ExpensesPage } from "@/features/expenses";

export default function Expenses() {
  return (
    <ProtectedRoute permission="expenses">
      <ExpensesPage />
    </ProtectedRoute>
  );
}
