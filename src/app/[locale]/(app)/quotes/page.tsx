"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { QuotesPage } from "@/features/quotes";

export default function Quotes() {
  return (
    <ProtectedRoute permission="quotes">
      <QuotesPage />
    </ProtectedRoute>
  );
}
