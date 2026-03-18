"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { DashboardPage } from "@/features/dashboard";

export default function Dashboard() {
  return (
    <ProtectedRoute permission="dashboard">
      <DashboardPage />
    </ProtectedRoute>
  );
}
