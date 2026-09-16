"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";

const DISMISS_KEY = "probook_pwa_install_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallBanner() {
  const { t } = useTranslation("common");
  const [show, setShow] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Don't show if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Don't show if previously dismissed
    if (localStorage.getItem(DISMISS_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === "accepted") {
      setShow(false);
    }
    deferredPrompt.current = null;
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "true");
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* On a phone the two buttons take a row of their own under the text,
          at full tap height, instead of squeezing the sentence into a sliver
          beside them. A separate corner X used to duplicate "dismiss" there,
          unlabelled and on top of the install button; it is gone. */}
      <div className="mx-auto max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 shrink-0">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">
            {t("pwa.installTitle")}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("pwa.installDescription")}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 shrink-0 max-sm:w-full">
          <button
            onClick={handleDismiss}
            className="min-h-10 sm:min-h-0 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors px-3 sm:px-2 py-1.5"
          >
            {t("pwa.dismiss")}
          </button>
          <button
            onClick={handleInstall}
            className="min-h-10 sm:min-h-0 px-4 sm:px-3 py-1.5 bg-primary-600 text-white text-xs font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            {t("pwa.install")}
          </button>
        </div>
      </div>
    </div>
  );
}
