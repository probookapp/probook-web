/**
 * Composing a subscription module by module.
 *
 * The three offers stay the front door. This is for the business the offers do
 * not describe: the shop that wants the till and nothing else, the office that
 * wants multi-site reporting without a counter. Before it, they had one honest
 * option — pay for a bundle and use a third of it.
 *
 * The whole design rests on one number: what a module costs on its own. Set it
 * too low and the bundles stop meaning anything, because assembling Commerce à
 * la carte undercuts Commerce. Set it too high and nobody composes, and the
 * composer is decoration that makes the product look expensive.
 *
 * So the unit prices are calibrated to put the tipping point at three modules:
 * one or two are cheaper à la carte, three or more and the bundle wins. That is
 * a real choice at the small end and a clear answer at the large end, and it
 * needs no banner telling anyone what to do — the totals say it.
 *
 * Nothing here reads the database. It is arithmetic over what the pricing page
 * already fetched, which is what makes it testable and what keeps a price from
 * being computed one way on the page and another way on the server.
 */

/** Everything a composed subscription is made of. */
export interface Composition {
  /** Feature keys the customer picked. */
  moduleKeys: string[];
  /** Total user accounts wanted, base included. */
  seats: number;
}

export interface ModuleOption {
  key: string;
  name: string;
  /** Monthly price in centimes. A module without one is not sold separately. */
  unitPrice: number | null;
}

export interface BundleOption {
  id: string;
  slug: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  /** Feature keys the bundle carries beyond the base product. */
  moduleKeys: string[];
  /** Seats the bundle covers, null for unlimited. */
  seats: number | null;
}

export interface PricingBasis {
  /** The entry offer everyone pays: the core product, sold to nobody in parts. */
  baseMonthlyPrice: number;
  /** Seats the base covers before any are bought. */
  baseSeats: number;
  /** Monthly price of one extra seat, in centimes. */
  seatUnitPrice: number;
  /** Yearly billing charges this many months. */
  monthsPerYear: number;
}

/**
 * Ten months for twelve is the discount the bundles already advertise, so the
 * composer applies the same one rather than inventing a second rule that would
 * make yearly cheaper on one page and dearer on another.
 */
export const DEFAULT_BASIS: PricingBasis = {
  baseMonthlyPrice: 190_000,
  baseSeats: 1,
  seatUnitPrice: 30_000,
  monthsPerYear: 10,
};

/**
 * One dinar, expressed elsewhere.
 *
 * `perDzd` is how much of the target currency one dinar buys; `roundTo` is the
 * step the result lands on, in that currency's minor units.
 */
export interface CurrencyRate {
  code: string;
  perDzd: number;
  roundTo: number;
}

/**
 * Convert a price written in dinar centimes into another currency.
 *
 * Rounded **up** to the step, never down. A price that rounds down is a discount
 * nobody decided to give, repeated on every line of every invoice; rounding up
 * is at worst a few centimes in the seller's favour on a figure the seller
 * publishes. And the step is what keeps the result printable: 7 900 DZD at
 * 0.0069 is 54.51 EUR, which reads like a conversion; to the nearest euro it
 * reads like a price.
 */
export function convertFromDzd(centimesDzd: number, rate: CurrencyRate): number {
  const raw = centimesDzd * rate.perDzd;
  const step = rate.roundTo > 0 ? rate.roundTo : 1;
  return Math.ceil(raw / step) * step;
}

/** The seat counts offered, rather than a free-text box nobody calibrates. */
export const SEAT_TIERS = [1, 3, 5, 10] as const;

export interface Quote {
  /** Monthly total in centimes. */
  monthly: number;
  /** Yearly total in centimes. */
  yearly: number;
  base: number;
  modules: number;
  seats: number;
  /** Modules that were asked for but carry no price — never silently free. */
  unpriced: string[];
}

/**
 * What a composition costs.
 *
 * A module the catalogue never priced is reported, not charged at zero: a
 * composer that quietly gives something away is worse than one that refuses,
 * because nobody finds out until the invoice.
 */
export function quote(
  composition: Composition,
  modules: ModuleOption[],
  basis: PricingBasis = DEFAULT_BASIS
): Quote {
  const byKey = new Map(modules.map((m) => [m.key, m]));

  let moduleTotal = 0;
  const unpriced: string[] = [];
  for (const key of composition.moduleKeys) {
    const option = byKey.get(key);
    if (!option || option.unitPrice == null) {
      unpriced.push(key);
      continue;
    }
    moduleTotal += option.unitPrice;
  }

  const extraSeats = Math.max(0, composition.seats - basis.baseSeats);
  const seatTotal = extraSeats * basis.seatUnitPrice;
  const monthly = basis.baseMonthlyPrice + moduleTotal + seatTotal;

  return {
    monthly,
    yearly: monthly * basis.monthsPerYear,
    base: basis.baseMonthlyPrice,
    modules: moduleTotal,
    seats: seatTotal,
    unpriced,
  };
}

/**
 * A bundle that gives at least this composition for strictly less.
 *
 * Deliberately one-directional. When the bundle wins, saying so is useful and
 * the customer would have found it anyway by reading the cards above. When the
 * composition wins, saying so would be a banner arguing against the offers on
 * the same page that sells them — and the user was right to cut it: people who
 * read three cards and a total do not need to be told which is cheaper.
 *
 * "At least" and not "exactly": a bundle carrying an extra module for less
 * money is still a better deal, and pretending otherwise to keep the comparison
 * tidy would be the kind of true-but-misleading line that costs trust.
 */
export function bundleThatBeats(
  composition: Composition,
  bundles: BundleOption[],
  monthlyTotal: number
): BundleOption | null {
  const wanted = new Set(composition.moduleKeys);

  const candidates = bundles.filter((b) => {
    const covers = [...wanted].every((k) => b.moduleKeys.includes(k));
    const seatsFit = b.seats === null || b.seats >= composition.seats;
    return covers && seatsFit && b.monthlyPrice < monthlyTotal;
  });

  if (candidates.length === 0) return null;
  return candidates.reduce((cheapest, b) =>
    b.monthlyPrice < cheapest.monthlyPrice ? b : cheapest
  );
}
