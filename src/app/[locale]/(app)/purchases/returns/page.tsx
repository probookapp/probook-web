"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { SupplierReturnsPage } from "@/features/purchases";

export default function SupplierReturns() {
  return (
    <ProtectedRoute permission="purchases">
      <SupplierReturnsPage />
    </ProtectedRoute>
  );
}
