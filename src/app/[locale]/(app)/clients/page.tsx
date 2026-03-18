"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { ClientsPage } from "@/features/clients";

export default function Clients() {
  return (
    <ProtectedRoute permission="clients">
      <ClientsPage />
    </ProtectedRoute>
  );
}
