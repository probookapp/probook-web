"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";

export function ServiceWorkerRegistration() {
  const { t } = useTranslation("common");
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  // Set when the user clicks "update": only then is a controller change ours to
  // reload for. sw.js calls clients.claim(), so the very first visit also fires
  // controllerchange (no controller → this worker), and reloading on that
  // wiped whatever the visitor had started typing, the sign-up form included.
  const updateRequested = useRef(false);

  useEffect(() => {
    // Not in development: dev chunk URLs are not content-hashed, so the
    // worker's cache-first rule for /_next/static/ serves yesterday's code
    // after an edit. Drop a worker an earlier dev session left behind.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker?.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Check for updates periodically
          setInterval(() => reg.update(), 60 * 60 * 1000);

          // Listen for new service worker
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                // New version available
                setWaitingWorker(newWorker);
                setShowUpdateBanner(true);
              }
            });
          });

          // Also check if there's already a waiting worker
          if (reg.waiting && navigator.serviceWorker.controller) {
            setWaitingWorker(reg.waiting);
            setShowUpdateBanner(true);
          }
        })
        .catch((err) => {
          console.warn("Service worker registration failed:", err);
        });

      // Listen for controller change (after skipWaiting)
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing || !updateRequested.current) return;
        refreshing = true;
        window.location.reload();
      });
    }

    // Request persistent storage so the browser never evicts our IndexedDB cache
    if (navigator.storage?.persist) {
      navigator.storage.persist();
    }
  }, []);

  const handleUpdate = useCallback(() => {
    if (waitingWorker) {
      updateRequested.current = true;
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
  }, [waitingWorker]);

  if (!showUpdateBanner) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-100 bg-primary-600 text-white px-4 py-3 flex items-center justify-center gap-3 shadow-lg">
      <RefreshCw className="h-4 w-4" />
      <span className="text-sm font-medium">
        {t("update.newVersionAvailable")}
      </span>
      <button
        onClick={handleUpdate}
        className="px-3 py-1 bg-white text-primary-600 text-sm font-semibold rounded-lg hover:bg-primary-50 transition-colors"
      >
        {t("update.updateNow")}
      </button>
    </div>
  );
}
