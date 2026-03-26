"use client";

import { useAuthStore } from "@/stores/useAuthStore";
import { useRouter, usePathname } from "@/lib/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AnnouncementBanner } from "@/components/shared/AnnouncementBanner";
import { DemoModeProvider, DemoModeBanner } from "@/components/providers/DemoModeProvider";
import { ImpersonationBar } from "@/components/shared/ImpersonationBar";
import { PwaInstallBanner } from "@/components/shared/PwaInstallBanner";
import { ConflictResolutionModal } from "@/components/shared/ConflictResolutionModal";
import { tenantSubscriptionApi } from "@/lib/admin-api";
import { TenantSettingsProvider } from "@/components/providers/TenantSettingsProvider";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, isAuthenticated } = useAuthStore();
  const { t } = useTranslation("common");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["current-subscription"],
    queryFn: () => tenantSubscriptionApi.getCurrent() as Promise<Record<string, unknown> | null>,
    enabled: isAuthenticated && !isLoading,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Check subscription status
  const subStatus = subscription?.status as string | undefined;
  const isActive = subStatus === "active";
  const isInTrial = subStatus === "trial" || subStatus === "trialing";
  const hasValidSubscription = isActive || isInTrial;

  // Demo mode: no valid subscription (banner shows on all pages including settings)
  const isDemoMode = !subLoading && !hasValidSubscription;

  // Check if subscription expires within 30 days
  const periodEnd = subscription?.period_end as string | undefined;
  let showExpiryWarning = false;
  let daysUntilExpiry = 0;
  if (hasValidSubscription && periodEnd) {
    const endDate = new Date(periodEnd);
    const now = new Date();
    daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    showExpiryWarning = daysUntilExpiry > 0 && daysUntilExpiry <= 30;
  }

  return (
    <ErrorBoundary>
      <DemoModeProvider isDemoMode={isDemoMode}>
        <TenantSettingsProvider />
        <ImpersonationBar />
        <Layout topBanner={<DemoModeBanner />}>
          {showExpiryWarning && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-4 py-2">
              <div className="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  {t("subscription.expiryWarning", { days: daysUntilExpiry })}
                </span>
              </div>
            </div>
          )}
          <AnnouncementBanner />
          {children}
        </Layout>
        <PwaInstallBanner />
        <ConflictResolutionModal />
      </DemoModeProvider>
    </ErrorBoundary>
  );
}
