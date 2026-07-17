"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { adminOnboardingApi } from "@/lib/admin-api";

type TenantOnboarding = {
  id: string;
  steps?: { step_key: string; completed: boolean }[];
};

const STEPS = [
  "company_setup",
  "first_client",
  "first_product",
  "first_quote",
  "first_invoice",
] as const;

export function OnboardingFunnel() {
  const { t } = useTranslation("admin");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-onboarding"],
    queryFn: adminOnboardingApi.getAll,
  });

  const tenants = (data || []) as unknown as TenantOnboarding[];
  const total = tenants.length;

  // Count how many tenants have completed each step.
  const counts = STEPS.map((step) => {
    const n = tenants.filter((tn) =>
      (tn.steps || []).some((s) => s.step_key === step && s.completed)
    ).length;
    return { step, count: n, pct: total > 0 ? Math.round((n / total) * 100) : 0 };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("onboardingFunnel.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          </div>
        ) : total === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
            {t("onboardingFunnel.empty")}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("onboardingFunnel.subtitle", { count: total })}
            </p>
            {counts.map(({ step, count, pct }) => (
              <div key={step}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700 dark:text-gray-300">
                    {t(`onboardingFunnel.steps.${step}`, step)}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {count} / {total} ({pct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-2 rounded-full bg-primary-500 dark:bg-primary-400 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
