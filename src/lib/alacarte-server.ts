import { prisma } from "./db";
import { QUOTA_KEYS } from "./plan-quotas";
import {
  quote,
  DEFAULT_BASIS,
  type Composition,
  type ModuleOption,
  type PricingBasis,
  type Quote,
} from "./alacarte";

/**
 * The database half of the composer.
 *
 * The price a customer was shown is never trusted: it arrives from a page they
 * can edit. The composition — which modules, how many seats — is the input, and
 * the price is recomputed here from the same catalogue and the same arithmetic
 * the page used, so the two can never disagree about what was bought.
 */

/** The entry offer everyone pays for, the seats it covers, and its currency. */
async function readBasis(): Promise<{ basis: PricingBasis; currency: string }> {
  const base = await prisma.plan.findFirst({
    where: { isActive: true },
    orderBy: { monthlyPrice: "asc" },
    include: { quotas: true },
  });
  if (!base) return { basis: DEFAULT_BASIS, currency: "DZD" };

  const seatQuota = base.quotas.find((q) => q.quotaKey === QUOTA_KEYS.MAX_USERS);
  return {
    basis: {
      ...DEFAULT_BASIS,
      baseMonthlyPrice: base.monthlyPrice,
      baseSeats: seatQuota?.limitValue ?? DEFAULT_BASIS.baseSeats,
    },
    currency: base.currency,
  };
}

/** Modules that are actually sold separately, priced. */
export async function sellableModules(): Promise<ModuleOption[]> {
  const flags = await prisma.featureFlag.findMany({
    where: { unitPrice: { not: null } },
    select: { key: true, name: true, unitPrice: true },
  });
  return flags.map((f) => ({ key: f.key, name: f.name, unitPrice: f.unitPrice }));
}

export interface PricedComposition {
  quote: Quote;
  modules: ModuleOption[];
  /** The currency the figures above are in — the catalogue's own. */
  currency: string;
}

/**
 * Price a composition server-side, refusing anything that carries a module the
 * catalogue does not sell. A composed offer containing something nobody priced
 * would be billed at less than it grants, every month, silently.
 */
export async function priceComposition(
  composition: Composition,
  /** The currency the request asked to be billed in, when it named one. */
  requestedCurrency?: string
): Promise<
  | PricedComposition
  | { error: string; code: "MODULE_NOT_SOLD"; keys: string[] }
  | { error: string; code: "CURRENCY_NOT_COMPOSABLE"; currency: string }
> {
  const [modules, { basis, currency }] = await Promise.all([
    sellableModules(),
    readBasis(),
  ]);

  // Module prices carry no currency of their own and nothing converts them.
  // Billing a euro request off dinar figures would be wrong by the exchange
  // rate — and wrong quietly, every month. The listed offers are priced per
  // currency and remain available.
  if (requestedCurrency && requestedCurrency !== currency) {
    return {
      error: `Composed offers are priced in ${currency}. Choose a listed offer to be billed in ${requestedCurrency}.`,
      code: "CURRENCY_NOT_COMPOSABLE",
      currency,
    };
  }

  const priced = quote(composition, modules, basis);

  if (priced.unpriced.length > 0) {
    return {
      error: `These modules are not sold separately: ${priced.unpriced.join(", ")}.`,
      code: "MODULE_NOT_SOLD",
      keys: priced.unpriced,
    };
  }

  return { quote: priced, modules, currency };
}

/**
 * The private offer a composition becomes.
 *
 * Created inactive, which is the whole trick and needs no schema of its own:
 * the public pricing endpoint only lists active plans, so this never appears in
 * the shop window, while `feature-gate` resolves entitlements through
 * `PlanFeature` links and never looks at `isActive`. So the offer grants
 * exactly what was composed, to exactly one business.
 *
 * One row per composition rather than one reused per tenant: a subscription
 * points at a plan, and rewriting a plan a live subscription depends on would
 * silently change what an existing customer is paying for.
 */
export async function createComposedPlan(
  tenantId: string,
  composition: Composition,
  priced: Quote,
  currency: string
): Promise<{ id: string }> {
  const suffix = `${tenantId.slice(0, 8)}-${Date.now().toString(36)}`;
  const modules = await prisma.featureFlag.findMany({
    where: { key: { in: composition.moduleKeys } },
    select: { id: true },
  });

  const plan = await prisma.plan.create({
    data: {
      slug: `custom-${suffix}`,
      name: "Custom offer",
      description: `Composed: ${composition.moduleKeys.join(", ") || "core only"}, ${composition.seats} seat(s)`,
      monthlyPrice: priced.monthly,
      yearlyPrice: priced.yearly,
      currency,
      trialDays: 0,
      // Never in the shop window; still a full offer for entitlement purposes.
      isActive: false,
      sortOrder: 999,
      features: { create: modules.map((m) => ({ featureId: m.id })) },
      quotas: {
        create: [{ quotaKey: QUOTA_KEYS.MAX_USERS, limitValue: composition.seats }],
      },
    },
    select: { id: true },
  });

  return plan;
}
