"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { InvoiceFormPage } from "@/features/invoices";

export default function NewInvoice() {
  return (
    <ProtectedRoute permission="invoices">
      <InvoiceFormPage />
    </ProtectedRoute>
  );
}
