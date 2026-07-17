"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { CreditNoteViewPage } from "@/features/invoices";

export default function CreditNoteView() {
  return (
    <ProtectedRoute permission="invoices">
      <CreditNoteViewPage />
    </ProtectedRoute>
  );
}
