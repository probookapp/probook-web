"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { CreditNotesPage } from "@/features/invoices";

export default function CreditNotes() {
  return (
    <ProtectedRoute permission="invoices">
      <CreditNotesPage />
    </ProtectedRoute>
  );
}
