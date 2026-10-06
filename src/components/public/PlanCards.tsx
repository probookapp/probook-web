"use client";

import Link from "next/link";
import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { translatedName, type Translations } from "@/lib/translated-name";
import { formatPriceTag } from "@/lib/price-tag";

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

export type BillingCycle = "monthly" | "yearly";

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
 * What every offer contains, named.
 *
 * These are not feature flags and never will be: invoicing, quotes, credit
 * notes, the catalogue, the dashboard and the basic reports are the product,
 * and a legal obligation is not sold separately. But because they carry no
 * flag, the entry offer linked nothing and its card rendered no list at all —
 * a price with nothing under it, for the one offer that contains the most.
 */
const CORE_INCLUSIONS = [
  "pricing.core.invoicing",
  "pricing.core.quotes",
  "pricing.core.creditNotes",
  "pricing.core.catalogue",
  "pricing.core.dashboard",
  "pricing.core.reports",
] as const;

/** The seats an offer covers, or null when it sets no ceiling. */
function seatsOf(plan: PublicPlan): number | null {
  const quota = plan.quotas?.find((q) => q.quota_key === "max_users");
  return quota ? quota.limit_value : null;
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
        const featureNames = plan.features
          ?.map((f) =>
            f.feature ? translatedName(f.feature.name, f.feature.name_translations ?? null, locale) : null
          )
          .filter(Boolean) as string[] || [];
        const monthlyFigure =
          billingCycle === "monthly" ? plan.monthly_price : plan.yearly_price / 12;
        const seats = seatsOf(plan);

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
            {/* Always a monthly figure, as the market prints it: on the yearly
                cycle it is the yearly price spread over twelve months, so the
                switch changes the number and not the unit, and the discount
                reads at a glance. What is actually charged sits right under it. */}
            <div className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-gray-900 dark:text-white">
                {formatPriceTag(monthlyFigure, plan.currency, locale)}
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                {tc("landing.pricing.perMonth")}
              </span>
            </div>
            {billingCycle === "yearly" && plan.yearly_price > 0 && (
              <p dir={textDir} className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("pricing.billedYearly", { amount: formatPriceTag(plan.yearly_price, plan.currency, locale) })}
              </p>
            )}
            {plan.trial_days > 0 && (
              <p className="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400">
                {tc("landing.pricing.trialDays", { days: plan.trial_days })}
              </p>
            )}
            {/* Seats are half the difference between one offer and the
                next, and the card said nothing about them. */}
            <p
              dir={textDir}
              className="mt-6 text-sm font-medium text-gray-900 dark:text-gray-100"
            >
              {seats === null
                ? t("pricing.seatsUnlimited")
                : t("pricing.seats", { count: seats })}
            </p>

            <ul className="mt-6 space-y-3">
              {CORE_INCLUSIONS.map((key) => (
                <li key={key} className="flex items-start gap-3">
                  <Check className="h-5 w-5 shrink-0 mt-0.5 text-primary-600 dark:text-primary-400" />
                  <span dir={textDir} className="text-sm text-gray-600 dark:text-gray-300">
                    {t(key)}
                  </span>
                </li>
              ))}
            </ul>

            {featureNames.length > 0 && (
              <>
                <p
                  dir={textDir}
                  className="mt-6 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                >
                  {t("pricing.andAlso")}
                </p>
                <ul className="mt-3 space-y-3">
                  {featureNames.map((name, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className="h-5 w-5 shrink-0 mt-0.5 text-primary-600 dark:text-primary-400" />
                      <span dir={textDir} className="text-sm text-gray-600 dark:text-gray-300">
                        {name}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
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
