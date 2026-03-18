"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { QuoteViewPage } from "@/features/quotes";

export default function QuoteView() {
  return (
    <ProtectedRoute permission="quotes">
      <QuoteViewPage />
    </ProtectedRoute>
  );
}
