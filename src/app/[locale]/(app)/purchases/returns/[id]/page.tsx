"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { SupplierReturnViewPage } from "@/features/purchases";

export default function SupplierReturnView() {
  return (
    <ProtectedRoute permission="purchases">
      <SupplierReturnViewPage />
    </ProtectedRoute>
  );
}
