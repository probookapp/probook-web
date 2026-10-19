"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { StockTransferViewPage } from "@/features/locations";

export default function StockTransferView() {
  return (
    <ProtectedRoute permission="products">
      <StockTransferViewPage />
    </ProtectedRoute>
  );
}
