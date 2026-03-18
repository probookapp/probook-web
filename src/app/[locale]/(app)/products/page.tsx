"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { ProductsPage } from "@/features/products";

export default function Products() {
  return (
    <ProtectedRoute permission="products">
      <ProductsPage />
    </ProtectedRoute>
  );
}
