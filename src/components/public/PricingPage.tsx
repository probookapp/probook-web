"use client";

import Link from "next/link";
import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { PublicLayout } from "./PublicLayout";
import { trackMetaEvent } from "@/components/analytics/MetaPixel";
import { PlanCards, usePublicPlans, type BillingCycle } from "./PlanCards";
import { yearlyMonthsFree } from "@/lib/price-tag";
import { OfferComposer } from "@/components/shared/OfferComposer";


export function PricingPage() {
  const { t } = useTranslation(["pages", "common"]);
  const tc = (key: string, opts?: Record<string, unknown>) =>
    t(key, { ns: "common", ...opts });
  const locale = useLocale();
  const isRtl = locale === "ar";
  const textDir = isRtl ? "rtl" : undefined;
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("yearly");

  // Pricing view is a purchase-intent signal — feeds retargeting audiences of
  // ad visitors who considered but didn't convert. Fires once on mount; the
  // pixel is loaded by the enclosing PublicLayout.
  useEffect(() => {
    trackMetaEvent("ViewContent", { content_name: "pricing" });
  }, []);

  const { data: plansData, isLoading } = usePublicPlans();

  const plans = plansData?.plans;
  const monthsFree = yearlyMonthsFree(plans);

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
          aria-label={t("pricing.yearly")}
          onClick={() => setBillingCycle(billingCycle === "monthly" ? "yearly" : "monthly")}
          // The pseudo-element widens the target to 44px tall without growing the
          // switch itself.
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors before:absolute before:-inset-2.5 ${
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
          <span className="hidden sm:inline absolute start-full top-1/2 -translate-y-1/2 ms-2 whitespace-nowrap">
            <span className="inline-flex items-center rounded-full bg-green-50 dark:bg-green-950 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300 ring-1 ring-inset ring-green-600/20">
              {monthsFree > 0
                ? t("pricing.monthsFree", { count: monthsFree })
                : t("pricing.saveWithYearly")}
            </span>
          </span>
        </span>
      </div>

      {/* Plans */}
      <section className="pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <PlanCards plans={plans} isLoading={isLoading} billingCycle={billingCycle} />

          {/* Composing comes after the offers, from a button of its own: mixing
              tick boxes into the cards makes it unclear whether a click buys or
              builds. A visitor has no business to attach an offer to, so the
              step here is signing up. */}
          {plans && plans.length > 0 && (
            <OfferComposer
              plans={plans}
              billingCycle={billingCycle}
              currency={plans[0].currency}
              seatPrice={plansData?.seat_price}
              submitLabel={tc("landing.pricing.getStarted")}
              footer={
                <Link
                  href={`/${locale}/signup`}
                  className="block w-full text-center py-3 rounded-xl font-semibold text-sm bg-primary-600 hover:bg-primary-700 text-white transition-colors"
                >
                  {tc("landing.pricing.getStarted")}
                </Link>
              }
            />
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
            className="inline-flex min-h-10 items-center text-primary-600 dark:text-primary-400 font-medium hover:underline"
          >
            {t("pricing.viewFaq")}
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
