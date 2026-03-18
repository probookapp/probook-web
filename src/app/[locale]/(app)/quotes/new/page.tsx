"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { QuoteFormPage } from "@/features/quotes";

export default function NewQuote() {
  return (
    <ProtectedRoute permission="quotes">
      <QuoteFormPage />
    </ProtectedRoute>
  );
}
