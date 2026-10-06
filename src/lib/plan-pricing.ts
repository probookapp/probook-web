import { convertFromDzd, type CurrencyRate } from "./alacarte";
import { REFERENCE_CURRENCY } from "./currencies";

/**
 * What an offer costs, and what a coupon takes off it, in the currency the
 * customer is billed in.
 *
 * The price list, the coupon check and the approval each used to work this out
 * on their own, and they disagreed: the list converted with the rate, the
 * approval did not, and a fixed coupon written in dinars was subtracted from a
 * price in euros. One function each, shared by all three, so the figure a
 * customer is shown is the figure they are charged.
 */

export interface PlanPriceSource {
  monthlyPrice: number;
  yearlyPrice: number;
  /** The catalogue's own currency. */
  currency: string;
  /** Prices typed by hand for other currencies. */
  prices: { currency: string; monthlyPrice: number; yearlyPrice: number }[];
}

export interface ResolvedPrice {
  monthly: number;
  yearly: number;
  currency: string;
  /** Where the figure came from; "rate" means the modules must be converted too. */
  via: "row" | "catalogue" | "rate";
}

/**
 * An offer's price in a currency: a row typed by hand first, the rate
 * otherwise, the catalogue as written when neither exists.
 *
 * Rates are expressed against the dinar, so only a dinar catalogue is
 * converted — an offer composed in euros is already in its billing currency.
 */
export function resolvePlanPrice(
  plan: PlanPriceSource,
  currency: string | null | undefined,
  rate: CurrencyRate | null
): ResolvedPrice {
  if (currency) {
    const row = plan.prices.find((p) => p.currency === currency);
    if (row) {
      return { monthly: row.monthlyPrice, yearly: row.yearlyPrice, currency: row.currency, via: "row" };
    }
    if (rate && rate.code === currency && currency !== plan.currency && plan.currency === REFERENCE_CURRENCY) {
      return {
        monthly: convertFromDzd(plan.monthlyPrice, rate),
        yearly: convertFromDzd(plan.yearlyPrice, rate),
        currency: rate.code,
        via: "rate",
      };
    }
  }
  return { monthly: plan.monthlyPrice, yearly: plan.yearlyPrice, currency: plan.currency, via: "catalogue" };
}

export interface CouponTerms {
  /** "percentage", or anything else for a fixed amount. */
  discountType: string;
  /** A percentage (0–100), or centimes in `currency`. */
  discountValue: number;
  currency: string;
}

/**
 * A fixed discount written in dinars, expressed in another currency.
 *
 * Rounded **down** to the step — the mirror of `convertFromDzd`, which rounds a
 * price up. Either way the rounding never hands out money nobody decided to.
 */
function discountFromDzd(centimesDzd: number, rate: CurrencyRate): number {
  const raw = centimesDzd * rate.perDzd;
  const step = rate.roundTo > 0 ? rate.roundTo : 1;
  return Math.floor(raw / step) * step;
}

/**
 * The fixed discount a coupon grants in the billing currency, or null when it
 * cannot be expressed in it. A percentage needs no currency and is returned
 * as is.
 */
export function couponValueIn(
  coupon: CouponTerms,
  billingCurrency: string,
  rate: CurrencyRate | null
): number | null {
  if (coupon.discountType === "percentage") return coupon.discountValue;
  if (coupon.currency === billingCurrency) return coupon.discountValue;
  if (coupon.currency === REFERENCE_CURRENCY && rate && rate.code === billingCurrency) {
    return discountFromDzd(coupon.discountValue, rate);
  }
  // Dirhams off a price in euros, or dinars with no rate to read them by:
  // there is no honest figure to subtract.
  return null;
}

/**
 * What a coupon takes off a price, in the price's currency, or null when the
 * coupon cannot be applied in that currency. Never more than the price itself.
 */
export function couponDiscount(
  coupon: CouponTerms,
  basePrice: number,
  billingCurrency: string,
  rate: CurrencyRate | null
): number | null {
  const value = couponValueIn(coupon, billingCurrency, rate);
  if (value === null) return null;
  const discount =
    coupon.discountType === "percentage" ? Math.floor((basePrice * value) / 100) : value;
  return Math.min(Math.max(0, discount), basePrice);
}
