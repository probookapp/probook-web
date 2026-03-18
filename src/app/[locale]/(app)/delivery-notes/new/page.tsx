"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { DeliveryNoteFormPage } from "@/features/delivery-notes";

export default function NewDeliveryNote() {
  return (
    <ProtectedRoute permission="delivery_notes">
      <DeliveryNoteFormPage />
    </ProtectedRoute>
  );
}
