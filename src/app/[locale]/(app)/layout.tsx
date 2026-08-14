"use client";

import { useAuthStore } from "@/stores/useAuthStore";
import { useRouter } from "@/lib/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AnnouncementBanner } from "@/components/shared/AnnouncementBanner";
import { DemoModeProvider } from "@/components/providers/DemoModeProvider";
import { NoticeBar } from "@/components/shared/NoticeBar";
import { ImpersonationBar } from "@/components/shared/ImpersonationBar";
import { PwaInstallBanner } from "@/components/shared/PwaInstallBanner";
import { ConflictResolutionModal } from "@/components/shared/ConflictResolutionModal";
import { tenantSubscriptionApi } from "@/lib/admin-api";
import { TenantSettingsProvider } from "@/components/providers/TenantSettingsProvider";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, isAuthenticated } = useAuthStore();
  const router = useRouter();

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

  // Days remaining in the free trial (drives the trial countdown banner).
  let trialDaysLeft: number | null = null;
  const trialEndsAt = subscription?.trial_ends_at as string | undefined;
  if (isInTrial && trialEndsAt) {
    const diff = Math.ceil((new Date(trialEndsAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    trialDaysLeft = Math.max(0, diff);
  }

  // Check if a paid subscription expires within 30 days (not shown during a
  // trial — the trial has its own banner).
  const periodEnd = subscription?.period_end as string | undefined;
  let showExpiryWarning = false;
  let daysUntilExpiry = 0;
  if (hasValidSubscription && !isInTrial && periodEnd) {
    const endDate = new Date(periodEnd);
    const now = new Date();
    daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    showExpiryWarning = daysUntilExpiry > 0 && daysUntilExpiry <= 30;
  }

  return (
    <ErrorBoundary>
      <DemoModeProvider
        isDemoMode={isDemoMode}
        isInTrial={isInTrial}
        trialDaysLeft={trialDaysLeft}
        expiryDays={showExpiryWarning ? daysUntilExpiry : null}
      >
        <TenantSettingsProvider />
        <ImpersonationBar />
        {/* One strip, chosen by urgency — see NoticeBar. What it cannot fit is
            picked up by the dashboard rather than stacked on top of every page. */}
        <Layout topBanner={<NoticeBar />}>
          <AnnouncementBanner />
          {children}
        </Layout>
        <PwaInstallBanner />
        <ConflictResolutionModal />
      </DemoModeProvider>
    </ErrorBoundary>
  );
}
