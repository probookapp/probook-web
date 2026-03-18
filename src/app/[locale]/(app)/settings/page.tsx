"use client";

import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { SettingsPage } from "@/features/settings";

export default function Settings() {
  return (
    <ProtectedRoute permission="settings">
      <SettingsPage />
    </ProtectedRoute>
  );
}
