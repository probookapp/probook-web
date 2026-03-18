"use client";

import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function OfflinePage() {
  const { t } = useTranslation("common");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="text-center max-w-md">
        <WifiOff className="h-16 w-16 mx-auto text-gray-400 dark:text-gray-500 mb-6" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {t("offline.title")}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("offline.description")}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t("offline.retry")}
        </button>
      </div>
    </div>
  );
}
