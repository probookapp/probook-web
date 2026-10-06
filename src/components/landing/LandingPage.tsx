"use client";

import Link from "next/link";
import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/public/Navbar";
import { Footer } from "@/components/public/Footer";
import { WhatsAppCta } from "@/components/landing/WhatsAppCta";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import { PlanCards, usePublicPlans } from "@/components/public/PlanCards";
import {
  Receipt,
  Users,
  Wallet,
  BarChart3,
  Store,
  WifiOff,
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


export function LandingPage() {
  const { t, ready } = useTranslation("common");
  const locale = useLocale();

  const { data: plansData, isLoading: plansLoading } = usePublicPlans();
  const plans = plansData?.plans;

  const isRtl = locale === "ar";
  const textDir = isRtl ? "rtl" : undefined;

  if (!ready) return null;

  // No local .dark scope here. The root element already carries the theme,
  // stamped before the first paint, and duplicating it from React state made
  // this subtree's markup depend on a value the server cannot know — which is
  // the hydration mismatch that made React throw away the whole page and
  // rebuild it on every load where the stored theme differed from the cookie.
  return (
    <>
      <MetaPixel />
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
              <WhatsAppCta variant="hero" />
              <Link
                href={`/${locale}/signup`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-lg font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-8 py-3.5 rounded-xl border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
              >
                {t("landing.hero.cta")}
                <ArrowRight className="h-5 w-5" />
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
            {/* The same cards as the pricing page, at the same default cycle;
                switching the cycle and composing an offer stay over there. */}
            <PlanCards plans={plans} isLoading={plansLoading} billingCycle="yearly" />
            {plans && plans.length > 0 && (
              <div className="mt-10 text-center">
                <Link
                  href={`/${locale}/pricing`}
                  className="inline-flex min-h-10 items-center gap-2 text-primary-600 dark:text-primary-400 font-medium hover:underline"
                >
                  {t("landing.pricing.seeDetails")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Footer */}
        <Footer />

        {/* Persistent WhatsApp bubble */}
        <WhatsAppCta variant="float" />
      </div>
    </>
  );
}
