"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { ReportsPage } from "@/features/reports";

export default function Reports() {
  return (
    <ProtectedRoute permission="reports">
      <ReportsPage />
    </ProtectedRoute>
  );
}
