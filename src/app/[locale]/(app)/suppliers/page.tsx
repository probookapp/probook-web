"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { SuppliersPage } from "@/features/suppliers";

export default function Suppliers() {
  return (
    <ProtectedRoute permission="suppliers">
      <SuppliersPage />
    </ProtectedRoute>
  );
}
