"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { PhonebookPage } from "@/features/phonebook";

export default function Phonebook() {
  return (
    <ProtectedRoute permission="phonebook">
      <PhonebookPage />
    </ProtectedRoute>
  );
}
