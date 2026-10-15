"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { PurchaseViewPage } from "@/features/purchases";

export default function PurchaseView() {
  return (
    <ProtectedRoute permission="purchases">
      <PurchaseViewPage />
    </ProtectedRoute>
  );
}
