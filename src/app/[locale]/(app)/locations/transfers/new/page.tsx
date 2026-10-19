"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { StockTransferFormPage } from "@/features/locations";

export default function NewStockTransfer() {
  return (
    <ProtectedRoute permission="products">
      <StockTransferFormPage />
    </ProtectedRoute>
  );
}
