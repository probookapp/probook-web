"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { LocationsPage } from "@/features/locations";

export default function Locations() {
  return (
    <ProtectedRoute permission="products">
      <LocationsPage />
    </ProtectedRoute>
  );
}
