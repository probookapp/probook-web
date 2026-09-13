"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, SlidersHorizontal } from "lucide-react";
import { useLocale } from "@/lib/navigation";
import { translatedName, type Translations } from "@/lib/translated-name";
import {
  quote,
  bundleThatBeats,
  SEAT_TIERS,
  DEFAULT_BASIS,
  type BundleOption,
  type ModuleOption,
} from "@/lib/alacarte";

/**
 * Composing an offer, on screen.
 *
 * The three offers come first and stay first — this opens underneath them, from
 * a real button rather than a discreet link, because an option nobody can find
 * is not an option. The tick boxes deliberately do not live inside the offer
 * cards: mixing "buy this" and "build your own" into one control makes it
 * unclear which one a click is doing.
 *
 * The comparison line runs one way only. When a listed offer covers the same
 * choice for less, saying so is a service. When composing is cheaper, saying so
 * would be a banner arguing against the offers on the page that sells them.
 */

interface PlanLike {
  id: string;
  slug: string;
  name: string;
  /** Absent on callers that never translated offer names. */
  name_translations?: Translations;
  monthly_price: number;
  yearly_price: number;
  /** Resolved into the visitor's currency when one was detected. */
  currency: string;
  /** The currency the catalogue is written in, before that resolution. */
  base_currency?: string;
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

interface OfferComposerProps {
  plans: PlanLike[];
  billingCycle: "monthly" | "yearly";
  currency: string;
  /**
   * What one extra seat costs, in the same currency as everything above.
   * Converted server-side so this component never has to know a rate — it adds
   * up figures that already agree.
   */
  seatPrice?: number;
  /** Absent on the public page, where the only next step is signing up. */
  onSubmit?: (composition: { feature_keys: string[]; seats: number }) => void;
  isSubmitting?: boolean;
  submitLabel: string;
  /** Rendered instead of the submit button when there is nothing to submit to. */
  footer?: React.ReactNode;
}

function formatPrice(centimes: number, currency: string): string {
  const amount = centimes / 100;
  return `${amount.toLocaleString("en")} ${currency}`;
}

export function OfferComposer({
  plans,
  billingCycle,
  currency,
  seatPrice,
  onSubmit,
  isSubmitting,
  submitLabel,
  footer,
}: OfferComposerProps) {
  const { t } = useTranslation("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [seats, setSeats] = useState<number>(DEFAULT_BASIS.baseSeats);

  // Every module the catalogue sells, gathered from the offers that carry them.
  // A module with no unit price is not sold separately and never appears here —
  // showing it at zero would be giving it away.
  const modules = useMemo<ModuleOption[]>(() => {
    const byKey = new Map<string, ModuleOption>();
    for (const plan of plans) {
      for (const link of plan.features || []) {
        const f = link.feature;
        if (!f?.key || f.unit_price == null) continue;
        if (byKey.has(f.key)) continue;
        byKey.set(f.key, {
          key: f.key,
          name: translatedName(f.name, f.name_translations ?? null, locale),
          unitPrice: f.unit_price,
        });
      }
    }
    return [...byKey.values()];
  }, [plans, locale]);

  const bundles = useMemo<BundleOption[]>(
    () =>
      plans.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: translatedName(p.name, p.name_translations ?? null, locale),
        monthlyPrice: p.monthly_price,
        yearlyPrice: p.yearly_price,
        moduleKeys: (p.features || [])
          .map((l) => l.feature?.key)
          .filter((k): k is string => !!k),
        seats: p.quotas?.find((q) => q.quota_key === "max_users")?.limit_value ?? null,
      })),
    [plans, locale]
  );

  const composition = { moduleKeys: selected, seats };
  // The base is the cheapest listed offer, already in the displayed currency,
  // rather than the dinar constant the library falls back to.
  const basis = {
    ...DEFAULT_BASIS,
    baseMonthlyPrice: plans.length
      ? Math.min(...plans.map((p) => p.monthly_price))
      : DEFAULT_BASIS.baseMonthlyPrice,
    seatUnitPrice: seatPrice ?? DEFAULT_BASIS.seatUnitPrice,
  };
  const priced = quote(composition, modules, basis);
  const beaten = bundleThatBeats(composition, bundles, priced.monthly);
  const total = billingCycle === "monthly" ? priced.monthly : priced.yearly;

  if (modules.length === 0) return null;

  // No currency guard any more: module prices, the seat price and the offers
  // all arrive converted together, so the figures on this screen agree by
  // construction. The guard existed because they did not.

  const toggle = (key: string) =>
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  return (
    <div className="max-w-3xl mx-auto mt-12">
      {!open ? (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-700 px-6 py-3 font-semibold text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {t("composer.open")}
          </button>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            {t("composer.openHint")}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-6 sm:p-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("composer.title")}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("composer.subtitle", { base: formatPrice(priced.base, currency) })}
          </p>

          <fieldset className="mt-6">
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              {t("composer.modulesLegend")}
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {modules.map((m) => {
                const on = selected.includes(m.key);
                return (
                  <label
                    key={m.key}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      on
                        ? "border-primary-600 bg-primary-50 dark:bg-primary-900/20"
                        : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(m.key)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600"
                      />
                      <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
                        {m.name}
                      </span>
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-mono tabular-nums whitespace-nowrap">
                      +{formatPrice(m.unitPrice ?? 0, currency)}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              {t("composer.seatsLegend")}
            </legend>
            <div className="flex flex-wrap gap-2">
              {SEAT_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setSeats(tier)}
                  aria-pressed={seats === tier}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    seats === tier
                      ? "border-primary-600 bg-primary-50 dark:bg-primary-900/20 text-gray-900 dark:text-white"
                      : "border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-700"
                  }`}
                >
                  {/* The bare figure: the legend above already says what is
                      being counted, and a pluralised label would have to be
                      right in three grammars to stay selectable. */}
                  {tier}
                </button>
              ))}
            </div>
            {/* Unlimited stays an Enterprise thing: a ceiling anyone can compose
                away is not a ceiling. */}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {t("composer.unlimitedNote")}
            </p>
          </fieldset>

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {billingCycle === "monthly"
                  ? t("composer.totalMonthly")
                  : t("composer.totalYearly")}
              </span>
              <span className="text-3xl font-bold text-gray-900 dark:text-white font-mono tabular-nums">
                {formatPrice(total, currency)}
              </span>
            </div>

            {beaten && (
              // Factual, no button, no nudge — the reader decides.
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                {t("composer.bundleBeatsIt", {
                  plan: beaten.name,
                  price: formatPrice(
                    billingCycle === "monthly" ? beaten.monthlyPrice : beaten.yearlyPrice,
                    currency
                  ),
                })}
              </p>
            )}

            {onSubmit ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => onSubmit({ feature_keys: selected, seats })}
                className="mt-6 w-full rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white py-3 font-semibold text-sm transition-colors"
              >
                {isSubmitting ? t("composer.submitting") : submitLabel}
              </button>
            ) : (
              <div className="mt-6">{footer}</div>
            )}
          </div>

          <ul className="mt-6 space-y-2">
            {selected.length === 0 ? (
              <li className="text-sm text-gray-500 dark:text-gray-400">
                {t("composer.coreOnly")}
              </li>
            ) : (
              selected.map((key) => {
                const m = modules.find((x) => x.key === key);
                return (
                  <li
                    key={key}
                    className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
                  >
                    <Check className="h-4 w-4 text-primary-600 dark:text-primary-400 shrink-0" />
                    {m?.name ?? key}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
