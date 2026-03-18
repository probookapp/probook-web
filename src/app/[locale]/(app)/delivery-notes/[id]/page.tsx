"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { DeliveryNoteViewPage } from "@/features/delivery-notes";

export default function DeliveryNoteView() {
  return (
    <ProtectedRoute permission="delivery_notes">
      <DeliveryNoteViewPage />
    </ProtectedRoute>
  );
}
