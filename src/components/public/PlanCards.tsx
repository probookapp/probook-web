"use client";

import Link from "next/link";
import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { translatedName, type Translations } from "@/lib/translated-name";
import { OfferContents, OfferPrice, type BillingCycle } from "@/components/shared/OfferDetails";

export interface PublicPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  name_translations: Translations;
  description_translations: Translations;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  /** The catalogue's own currency, before per-visitor resolution. */
  base_currency?: string;
  trial_days: number;
  sort_order: number;
  features?: {
    feature?: {
      key: string;
      name: string;
      name_translations?: Translations;
      unit_price?: number | null;
    };
  }[];
  quotas?: { quota_key: string; limit_value: number }[];
}

export interface PlansResponse {
  plans: PublicPlan[];
  /** One extra seat, in the same currency as the offers above. */
  seat_price?: number;
  detected_currency: string | null;
  detected_country: string | null;
}

export type { BillingCycle };

/** The public catalogue, shared by the landing page and the pricing page. */
export function usePublicPlans() {
  return useQuery<PlansResponse>({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const res = await fetch("/api/subscription/plans");
      if (!res.ok) return { plans: [], detected_currency: null, detected_country: null };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The offer cards. The landing page and the pricing page each kept a copy of
 * them, and every improvement landed in one copy only — so the home page showed
 * thinner offers than the pricing page for the same catalogue.
 */
export function PlanCards({
  plans,
  isLoading,
  billingCycle,
}: {
  plans: PublicPlan[] | undefined;
  isLoading: boolean;
  billingCycle: BillingCycle;
}) {
  const { t } = useTranslation(["pages", "common"]);
  const tc = (key: string, opts?: Record<string, unknown>) =>
    t(key, { ns: "common", ...opts });
  const locale = useLocale();
  const textDir = locale === "ar" ? "rtl" : undefined;

  if (isLoading) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400">
        {tc("landing.pricing.loading")}
      </p>
    );
  }
  if (!plans || plans.length === 0) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400">
        {tc("landing.pricing.noPlans")}
      </p>
    );
  }

  // Mark the middle plan as popular (or the second one for 2 plans)
  const popularIdx = plans.length <= 2 ? plans.length - 1 : Math.floor(plans.length / 2);

  return (
    <div
      className={`grid grid-cols-1 gap-8 max-w-5xl mx-auto items-start ${
        plans.length === 1
          ? "md:grid-cols-1 max-w-md"
          : plans.length === 2
          ? "md:grid-cols-2 max-w-3xl"
          : "md:grid-cols-3"
      }`}
    >
      {plans.map((plan, idx) => {
        const isPopular = idx === popularIdx && plans.length > 1;

        return (
          <div
            key={plan.id}
            className={`rounded-2xl p-8 relative bg-white dark:bg-gray-950 ${
              isPopular
                ? "border-2 border-primary-600 shadow-lg shadow-primary-600/15"
                : "border border-gray-200 dark:border-gray-800 shadow-sm"
            }`}
          >
            {isPopular && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-white text-xs font-semibold px-3 py-1 rounded-full bg-primary-600">
                {tc("landing.pricing.popular")}
              </div>
            )}
            <h3 dir={textDir} className="text-lg font-semibold text-gray-900 dark:text-white">
              {translatedName(plan.name, plan.name_translations, locale)}
            </h3>
            {(plan.description || plan.description_translations) && (
              <p dir={textDir} className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {translatedName(plan.description, plan.description_translations, locale)}
              </p>
            )}
            <OfferPrice
              className="mt-6"
              amount={billingCycle === "monthly" ? plan.monthly_price : plan.yearly_price}
              currency={plan.currency}
              billingCycle={billingCycle}
            />
            {plan.trial_days > 0 && (
              <p className="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400">
                {tc("landing.pricing.trialDays", { days: plan.trial_days })}
              </p>
            )}
            <OfferContents plan={plan} />
            <Link
              href={`/${locale}/signup`}
              className={`mt-8 block w-full text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
                isPopular
                  ? "bg-primary-600 hover:bg-primary-700 text-white"
                  : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
              }`}
            >
              {plan.trial_days > 0
                ? tc("landing.pricing.startTrial")
                : tc("landing.pricing.getStarted")}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
