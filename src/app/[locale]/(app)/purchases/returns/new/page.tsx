"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { SupplierReturnFormPage } from "@/features/purchases";

export default function NewSupplierReturn() {
  return (
    <ProtectedRoute permission="purchases">
      <SupplierReturnFormPage />
    </ProtectedRoute>
  );
}
