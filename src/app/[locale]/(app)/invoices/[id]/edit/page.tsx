"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { InvoiceFormPage } from "@/features/invoices";

export default function EditInvoice() {
  return (
    <ProtectedRoute permission="invoices">
      <InvoiceFormPage />
    </ProtectedRoute>
  );
}
