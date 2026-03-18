"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { InvoiceViewPage } from "@/features/invoices";

export default function InvoiceView() {
  return (
    <ProtectedRoute permission="invoices">
      <InvoiceViewPage />
    </ProtectedRoute>
  );
}
