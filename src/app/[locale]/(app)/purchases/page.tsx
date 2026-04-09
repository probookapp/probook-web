"use client";
import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { PurchasesPage } from "@/features/purchases";

export default function Purchases() {
  return (
    <ProtectedRoute permission="purchases">
      <PurchasesPage />
    </ProtectedRoute>
  );
}
