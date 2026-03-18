"use client";

import { useAuthStore } from "@/stores/useAuthStore";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoginPage } from "@/features/auth";
import { POSPage } from "@/features/pos";

export default function POS() {
  const { isLoading, isAuthenticated } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <ErrorBoundary>
      <POSPage />
    </ErrorBoundary>
  );
}
