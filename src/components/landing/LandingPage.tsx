"use client";

import Link from "next/link";
import { useRouter, useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/components/providers/ThemeContext";
import { Navbar } from "@/components/public/Navbar";
import { Footer } from "@/components/public/Footer";
import {
  Receipt,
  Users,
  Wallet,
  BarChart3,
  Store,
  WifiOff,
  Check,
  ArrowRight,
} from "lucide-react";

const featureIcons = {
  invoicing: Receipt,
  clients: Users,
  payments: Wallet,
  reports: BarChart3,
  pos: Store,
  offline: WifiOff,
} as const;

const featureKeys = [
  "invoicing",
  "clients",
  "payments",
  "reports",
  "pos",
  "offline",
] as const;

type Translations = Record<string, string> | null;

interface PlanPrice {
  currency: string;
  monthly_price: number;
  yearly_price: number;
}

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
  prices?: PlanPrice[];
  features?: { feature?: { name: string; name_translations?: Translations } }[];
}

interface PlansResponse {
  plans: PublicPlan[];
  detected_currency: string | null;
  detected_country: string | null;
}

/** Pick the translated value for a locale, falling back to the default. */
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

export function LandingPage() {
  const { t, ready } = useTranslation("common");
  const router = useRouter();
  const locale = useLocale();
  const { resolvedTheme } = useTheme();

  const { data: plansData, isLoading: plansLoading } = useQuery<PlansResponse>({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const res = await fetch("/api/subscription/plans");
      if (!res.ok) return { plans: [], detected_currency: null, detected_country: null };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const plans = plansData?.plans;

  const isDark = resolvedTheme === "dark";
  const isRtl = locale === "ar";
  const textDir = isRtl ? "rtl" : undefined;

  if (!ready) return null;

  return (
    <div className={isDark ? "dark" : ""}>
      <div className="min-h-screen bg-white dark:bg-gray-950 transition-colors">
        <Navbar
          actions={
            <>
              <Link
                href={`/${locale}/login`}
                className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors px-3 py-2"
              >
                {t("landing.hero.login")}
              </Link>
              <Link
                href={`/${locale}/signup`}
                className="text-sm font-medium text-white px-4 py-2 rounded-lg transition-colors bg-primary-600 hover:bg-primary-700"
              >
                {t("landing.hero.cta")}
              </Link>
            </>
          }
        />

        {/* Hero */}
        <section className="pt-32 pb-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1 dir={textDir} className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
              {t("landing.hero.title")}{" "}
              <span className="text-primary-600 dark:text-primary-400">{t("landing.hero.titleHighlight")}</span>
            </h1>
            <p dir={textDir} className="mt-6 text-lg sm:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
              {t("landing.hero.subtitle")}
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href={`/${locale}/signup`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-white text-lg font-semibold px-8 py-3.5 rounded-xl shadow-lg transition-all bg-primary-600 hover:bg-primary-700 hover:-translate-y-0.5"
              >
                {t("landing.hero.cta")}
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href={`/${locale}/login`}
                className="w-full sm:w-auto inline-flex items-center justify-center text-lg font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-8 py-3.5 rounded-xl border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
              >
                {t("landing.hero.login")}
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 dir={textDir} className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                {t("landing.features.title")}
              </h2>
              <p dir={textDir} className="mt-4 text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
                {t("landing.features.subtitle")}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {featureKeys.map((key) => {
                const Icon = featureIcons[key];
                return (
                  <div
                    key={key}
                    className="rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-gray-800 transition-shadow hover:shadow-md bg-white dark:bg-gray-950"
                  >
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 bg-primary-50 dark:bg-primary-950">
                      <Icon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                    </div>
                    <h3 dir={textDir} className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      {t(`landing.features.${key}.title`)}
                    </h3>
                    <p dir={textDir} className="text-gray-500 dark:text-gray-400 leading-relaxed">
                      {t(`landing.features.${key}.description`)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-950">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 dir={textDir} className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                {t("landing.pricing.title")}
              </h2>
              <p dir={textDir} className="mt-4 text-lg text-gray-500 dark:text-gray-400">
                {t("landing.pricing.subtitle")}
              </p>
            </div>
            {plansLoading ? (
              <p className="text-center text-gray-500 dark:text-gray-400">
                {t("landing.pricing.loading")}
              </p>
            ) : !plans || plans.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400">
                {t("landing.pricing.noPlans")}
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
                  // Mark the middle plan as popular (or the second one for 2 plans)
                  const popularIdx = plans.length <= 2 ? plans.length - 1 : Math.floor(plans.length / 2);
                  const isPopular = idx === popularIdx && plans.length > 1;
                  const featureNames = plan.features
                    ?.map((f) => f.feature ? tr(f.feature.name, f.feature.name_translations ?? null, locale) : null)
                    .filter(Boolean) as string[] || [];
                  const price = { monthly: plan.monthly_price, yearly: plan.yearly_price, currency: plan.currency };

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
                          {t("landing.pricing.popular")}
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
                          {formatPrice(price.monthly, price.currency)}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {t("landing.pricing.perMonth")}
                        </span>
                      </div>
                      {price.yearly > 0 && (
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {formatPrice(price.yearly, price.currency)}{t("landing.pricing.perYear")}
                        </p>
                      )}
                      {plan.trial_days > 0 && (
                        <p className="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400">
                          {t("landing.pricing.trialDays", { days: plan.trial_days })}
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
                          ? t("landing.pricing.startTrial")
                          : t("landing.pricing.getStarted")}
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}
