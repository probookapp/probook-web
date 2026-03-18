"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { DeliveryNotesPage } from "@/features/delivery-notes";

export default function DeliveryNotes() {
  return (
    <ProtectedRoute permission="delivery_notes">
      <DeliveryNotesPage />
    </ProtectedRoute>
  );
}
