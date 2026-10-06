"use client";

import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { useLocale } from "@/lib/navigation";
import { formatPriceTag } from "@/lib/price-tag";
import { translatedName, type Translations } from "@/lib/translated-name";

/**
 * How an offer reads, wherever it is sold.
 *
 * The pricing page and the in-app subscription screen each drew their own card,
 * and they drifted: one spread the yearly price over twelve months, the other
 * printed the year; one listed what the entry offer contains, the other showed
 * a price over an empty card — for the offer that contains the most. Both now
 * draw the price and the contents from here.
 */

export type BillingCycle = "monthly" | "yearly";

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

export interface OfferContentsSource {
  quotas?: { quota_key: string; limit_value: number }[];
  features?: {
    feature?: { name: string; name_translations?: Translations };
  }[];
}

/** The seats an offer covers, or null when it sets no ceiling. */
function seatsOf(plan: OfferContentsSource): number | null {
  const quota = plan.quotas?.find((q) => q.quota_key === "max_users");
  return quota ? quota.limit_value : null;
}

/**
 * Always a monthly figure, as the market prints it: on the yearly cycle it is
 * the yearly price spread over twelve months, so the switch changes the number
 * and not the unit, and the discount reads at a glance. What is actually
 * charged sits right under it.
 */
export function OfferPrice({
  amount,
  original,
  currency,
  billingCycle,
  className = "",
  figureClassName = "text-4xl",
}: {
  /** What the cycle charges, discount included. */
  amount: number;
  /** What the cycle charges before a discount, when there is one. */
  original?: number | null;
  currency: string;
  billingCycle: BillingCycle;
  className?: string;
  figureClassName?: string;
}) {
  const { t } = useTranslation("pages");
  const { t: tc } = useTranslation("common");
  const locale = useLocale();
  const textDir = locale === "ar" ? "rtl" : undefined;
  const perMonth = (cycleAmount: number) =>
    billingCycle === "monthly" ? cycleAmount : cycleAmount / 12;
  // A month carved out of a whole yearly price reads whole too; the exact
  // figure charged is printed in full right under it.
  const monthly = (cycleAmount: number) =>
    formatPriceTag(perMonth(cycleAmount), currency, locale, {
      whole: billingCycle === "yearly" && Number.isInteger(cycleAmount / 100),
    });
  const unit = tc("landing.pricing.perMonth");
  const discounted = original != null && original !== amount;

  return (
    <div className={className}>
      {discounted && (
        <p className="text-sm text-gray-400 line-through">
          {monthly(original)}
          {unit}
        </p>
      )}
      <div className="flex items-baseline gap-1">
        <span
          className={`${figureClassName} font-bold ${
            discounted ? "text-primary-600 dark:text-primary-400" : "text-gray-900 dark:text-white"
          }`}
        >
          {monthly(amount)}
        </span>
        <span className="text-gray-500 dark:text-gray-400">{unit}</span>
      </div>
      {billingCycle === "yearly" && amount > 0 && (
        <p dir={textDir} className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("pricing.billedYearly", { amount: formatPriceTag(amount, currency, locale) })}
        </p>
      )}
    </div>
  );
}

/** The seats an offer covers, what every offer contains, and what this one adds. */
export function OfferContents({ plan }: { plan: OfferContentsSource }) {
  const { t } = useTranslation("pages");
  const locale = useLocale();
  const textDir = locale === "ar" ? "rtl" : undefined;
  const seats = seatsOf(plan);
  const featureNames = (plan.features ?? [])
    .map((f) =>
      f.feature ? translatedName(f.feature.name, f.feature.name_translations ?? null, locale) : null
    )
    .filter((name): name is string => Boolean(name));

  return (
    <>
      {/* Seats are half the difference between one offer and the next, and
          the card said nothing about them. */}
      <p dir={textDir} className="mt-6 text-sm font-medium text-gray-900 dark:text-gray-100">
        {seats === null ? t("pricing.seatsUnlimited") : t("pricing.seats", { count: seats })}
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
    </>
  );
}
