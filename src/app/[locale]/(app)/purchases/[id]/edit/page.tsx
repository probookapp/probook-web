"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { PurchaseFormPage } from "@/features/purchases";

export default function EditPurchase() {
  return (
    <ProtectedRoute permission="purchases">
      <PurchaseFormPage />
    </ProtectedRoute>
  );
}
