"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Eye, Lock, ArrowRight, X } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { SubscriptionWall } from "@/components/shared/SubscriptionWall";
import { tenantSubscriptionApi } from "@/lib/admin-api";

interface DemoModeContextValue {
  isDemoMode: boolean;
  showSubscribePrompt: () => void;
  openPlans: () => void;
}

const DemoModeContext = createContext<DemoModeContextValue>({
  isDemoMode: false,
  showSubscribePrompt: () => {},
  openPlans: () => {},
});

export function useDemoMode() {
  return useContext(DemoModeContext);
}

export function DemoModeProvider({
  isDemoMode,
  children,
}: {
  isDemoMode: boolean;
  children: React.ReactNode;
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);

  const showSubscribePrompt = useCallback(() => {
    setPromptOpen(true);
  }, []);

  const openPlans = useCallback(() => {
    setPromptOpen(false);
    setPlansOpen(true);
  }, []);

  return (
    <DemoModeContext.Provider value={{ isDemoMode, showSubscribePrompt, openPlans }}>
      {children}
      {isDemoMode && (
        <>
          <SubscribePrompt
            isOpen={promptOpen}
            onClose={() => setPromptOpen(false)}
            onViewPlans={openPlans}
          />
          {plansOpen && (
            <PlansOverlay onClose={() => setPlansOpen(false)} />
          )}
        </>
      )}
    </DemoModeContext.Provider>
  );
}

/** Render this inside the Layout's main content area, not as a sibling to Layout. */
export function DemoModeBanner() {
  const { t } = useTranslation("common");
  const { isDemoMode, openPlans } = useDemoMode();

  if (!isDemoMode) return null;

  return (
    <div className="bg-indigo-600 dark:bg-indigo-700 text-white">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="h-4 w-4 shrink-0 opacity-80" />
          <p className="text-sm font-medium truncate hidden sm:block">
            {t("demo.banner")}
          </p>
          <p className="text-sm font-medium sm:hidden">
            {t("demo.bannerShort")}
          </p>
        </div>
        <button
          onClick={openPlans}
          className="shrink-0 text-xs font-medium bg-white/20 hover:bg-white/30 rounded-md px-3 py-1.5 transition-colors"
        >
          <span className="hidden sm:inline">{t("demo.viewPlans")}</span>
          <span className="sm:hidden">{t("demo.subscribe")}</span>
        </button>
      </div>
    </div>
  );
}

function SubscribePrompt({
  isOpen,
  onClose,
  onViewPlans,
}: {
  isOpen: boolean;
  onClose: () => void;
  onViewPlans: () => void;
}) {
  const { t } = useTranslation("common");

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="sm">
      <div className="-mx-6 -mt-6 px-6 pt-10 pb-6 bg-linear-to-b from-indigo-50 to-transparent dark:from-indigo-950/30 dark:to-transparent">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center mb-5 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50">
            <Lock className="h-6 w-6 text-white" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {t("demo.promptTitle")}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-64 mx-auto leading-relaxed">
            {t("demo.promptDescription")}
          </p>
        </div>
      </div>
      <div className="pt-6 pb-2 space-y-3">
        <Button onClick={onViewPlans} className="w-full">
          {t("demo.viewPlans")}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
        <button
          onClick={onClose}
          className="w-full text-center text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-1"
        >
          {t("demo.maybeLater")}
        </button>
      </div>
    </Modal>
  );
}

function PlansOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("common");

  // Fetch fresh subscription status so pending requests are detected on reopen
  const { data: subscription } = useQuery({
    queryKey: ["current-subscription"],
    queryFn: () => tenantSubscriptionApi.getCurrent() as Promise<Record<string, unknown> | null>,
    staleTime: 0,
  });

  const subscriptionStatus = {
    status: (subscription?.status as string) || null,
    pending_request: subscription?.pending_request as boolean | undefined,
  };

  return (
    <div className="fixed inset-0 z-60 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10">
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          aria-label={t("buttons.close")}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <SubscriptionWall
        subscriptionStatus={subscriptionStatus}
        onRequestSuccess={onClose}
      />
    </div>
  );
}
