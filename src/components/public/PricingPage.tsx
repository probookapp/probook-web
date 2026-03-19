"use client";

import Link from "next/link";
import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check } from "lucide-react";
import { PublicLayout } from "./PublicLayout";

type Translations = Record<string, string> | null;

interface PublicPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  name_translations: Translations;
  description_translations: Translations;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  trial_days: number;
  sort_order: number;
  features?: { feature?: { name: string; name_translations?: Translations } }[];
}

interface PlansResponse {
  plans: PublicPlan[];
  detected_currency: string | null;
  detected_country: string | null;
}

function tr(defaultValue: string | null, translations: Translations, locale: string): string {
  if (locale !== "en" && translations && translations[locale]) {
    return translations[locale];
  }
  return defaultValue || "";
}

function formatPrice(centimes: number, currency: string): string {
  const amount = centimes / 100;
  if (currency === "DZD") {
    return `${amount.toLocaleString("en")} ${currency}`;
  }
  return `${amount.toLocaleString("en", { minimumFractionDigits: 2 })} ${currency}`;
}

export function PricingPage() {
  const { t } = useTranslation(["pages", "common"]);
  const tc = (key: string, opts?: Record<string, unknown>) =>
    t(key, { ns: "common", ...opts });
  const locale = useLocale();
  const isRtl = locale === "ar";
  const textDir = isRtl ? "rtl" : undefined;
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");

  const { data: plansData, isLoading } = useQuery<PlansResponse>({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const res = await fetch("/api/subscription/plans");
      if (!res.ok) return { plans: [], detected_currency: null, detected_country: null };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const plans = plansData?.plans;

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h1 dir={textDir} className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white tracking-tight">
            {t("pricing.title")}
          </h1>
          <p dir={textDir} className="mt-4 text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
            {t("pricing.subtitle")}
          </p>
        </div>
      </section>

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <span
          className={`text-sm font-medium ${
            billingCycle === "monthly"
              ? "text-gray-900 dark:text-gray-100"
              : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {t("pricing.monthly")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={billingCycle === "yearly"}
          onClick={() => setBillingCycle(billingCycle === "monthly" ? "yearly" : "monthly")}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            billingCycle === "yearly" ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
              billingCycle === "yearly" ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span className="relative">
          <span
            className={`text-sm font-medium ${
              billingCycle === "yearly"
                ? "text-gray-900 dark:text-gray-100"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {t("pricing.yearly")}
          </span>
          <span className="hidden sm:inline absolute left-full top-1/2 -translate-y-1/2 ml-2 whitespace-nowrap">
            <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-950 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300 ring-1 ring-inset ring-green-600/20">
              {t("pricing.saveWithYearly")}
            </span>
          </span>
        </span>
      </div>

      {/* Plans */}
      <section className="pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <p className="text-center text-gray-500 dark:text-gray-400">
              {tc("landing.pricing.loading")}
            </p>
          ) : !plans || plans.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400">
              {tc("landing.pricing.noPlans")}
            </p>
          ) : (
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
                const popularIdx = plans.length <= 2 ? plans.length - 1 : Math.floor(plans.length / 2);
                const isPopular = idx === popularIdx && plans.length > 1;
                const featureNames = plan.features
                  ?.map((f) =>
                    f.feature ? tr(f.feature.name, f.feature.name_translations ?? null, locale) : null
                  )
                  .filter(Boolean) as string[] || [];
                const price = billingCycle === "monthly" ? plan.monthly_price : plan.yearly_price;

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
                      {tr(plan.name, plan.name_translations, locale)}
                    </h3>
                    {(plan.description || plan.description_translations) && (
                      <p dir={textDir} className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {tr(plan.description, plan.description_translations, locale)}
                      </p>
                    )}
                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-gray-900 dark:text-white">
                        {formatPrice(price, plan.currency)}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {billingCycle === "monthly"
                          ? tc("landing.pricing.perMonth")
                          : tc("landing.pricing.perYear")}
                      </span>
                    </div>
                    {billingCycle === "yearly" && plan.monthly_price > 0 && (
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {formatPrice(Math.round(plan.yearly_price / 12), plan.currency)}{tc("landing.pricing.perMonth")}
                      </p>
                    )}
                    {plan.trial_days > 0 && (
                      <p className="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400">
                        {tc("landing.pricing.trialDays", { days: plan.trial_days })}
                      </p>
                    )}
                    {featureNames.length > 0 && (
                      <ul className="mt-8 space-y-3">
                        {featureNames.map((name, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <Check className="h-5 w-5 shrink-0 mt-0.5 text-primary-600 dark:text-primary-400" />
                            <span dir={textDir} className="text-sm text-gray-600 dark:text-gray-300">
                              {name}
                            </span>
                          </li>
                        ))}
                      </ul>
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
          )}
        </div>
      </section>

      {/* FAQ teaser */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto text-center">
          <h2 dir={textDir} className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {t("pricing.questionsTitle")}
          </h2>
          <p dir={textDir} className="text-gray-500 dark:text-gray-400 mb-6">
            {t("pricing.questionsSubtitle")}
          </p>
          <Link
            href={`/${locale}/faq`}
            className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
          >
            {t("pricing.viewFaq")}
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
