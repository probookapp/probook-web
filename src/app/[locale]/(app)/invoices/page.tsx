"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { InvoicesPage } from "@/features/invoices";

export default function Invoices() {
  return (
    <ProtectedRoute permission="invoices">
      <InvoicesPage />
    </ProtectedRoute>
  );
}
