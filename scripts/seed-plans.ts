/**
 * Installs the offers and the entitlement flags they carry.
 *
 * Run deliberately, never automatically:
 *
 *   npx dotenv -e .env.test -- npx tsx scripts/seed-plans.ts
 *
 * ORDER MATTERS AND IS NOT REVERSIBLE BY ACCIDENT. `feature-gate.ts` allows
 * everything while a flag does not exist. Creating a flag with is_global=false
 * before an offer carries it refuses that feature to every tenant at once, so
 * this writes the offers and their links in one transaction: at no point does a
 * flag exist without the offers that include it.
 *
 * Tenants without an active subscription — trials, and anyone the admin has not
 * placed on an offer — are refused the gated modules from the moment this runs.
 * That is what the gate means, and it is why this is a deliberate step.
 *
 * Prices are in centimes, the unit the Plan model stores.
 */
import { Client } from "pg";
import { FEATURE_KEYS, type FeatureKey } from "../src/lib/feature-keys";

interface Offer {
  slug: string;
  name: string;
  monthly: number;
  yearly: number;
  sortOrder: number;
  /** What this offer adds. Each offer also carries everything before it. */
  adds: FeatureKey[];
}

const OFFERS: Offer[] = [
  {
    slug: "essentiel",
    name: "Essentiel",
    monthly: 190_000,
    yearly: 1_900_000,
    sortOrder: 1,
    // Invoicing and the counter. For a retailer the till is often the reason
    // they buy at all, so it belongs in the offer they can afford.
    adds: [FEATURE_KEYS.POS],
  },
  {
    slug: "commerce",
    name: "Commerce",
    monthly: 390_000,
    yearly: 3_900_000,
    sortOrder: 2,
    adds: [
      FEATURE_KEYS.PURCHASING,
      FEATURE_KEYS.DELIVERY_NOTES,
      FEATURE_KEYS.EXPENSES,
      FEATURE_KEYS.IMPORT_EXPORT,
    ],
  },
  {
    slug: "entreprise",
    name: "Entreprise",
    monthly: 790_000,
    yearly: 7_900_000,
    sortOrder: 3,
    adds: [
      FEATURE_KEYS.MULTI_LOCATION,
      FEATURE_KEYS.ADVANCED_REPORTS,
      FEATURE_KEYS.REMINDERS,
      FEATURE_KEYS.PHONEBOOK,
    ],
  },
];

/** What a customer would call each module, for the admin screens. */
const FEATURE_NAMES: Record<FeatureKey, string> = {
  [FEATURE_KEYS.POS]: "Caisse",
  [FEATURE_KEYS.PURCHASING]: "Achats et fournisseurs",
  [FEATURE_KEYS.DELIVERY_NOTES]: "Bons de livraison",
  [FEATURE_KEYS.EXPENSES]: "Dépenses",
  [FEATURE_KEYS.MULTI_LOCATION]: "Stock multi-sites",
  [FEATURE_KEYS.ADVANCED_REPORTS]: "Rapports avancés",
  [FEATURE_KEYS.REMINDERS]: "Relances clients",
  [FEATURE_KEYS.PHONEBOOK]: "Annuaire et contacts",
  [FEATURE_KEYS.IMPORT_EXPORT]: "Import et sauvegarde",
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const target = url.replace(/:[^:@/]*@/, ":***@");
  console.log(`Seeding offers into ${target}`);

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");

    const flagIds = new Map<FeatureKey, string>();
    for (const [key, name] of Object.entries(FEATURE_NAMES) as [FeatureKey, string][]) {
      const res = await client.query<{ id: string }>(
        `INSERT INTO feature_flags (id, key, name, is_global, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, false, now(), now())
         ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, is_global = false, updated_at = now()
         RETURNING id`,
        [key, name]
      );
      flagIds.set(key, res.rows[0].id);
    }

    let carried: FeatureKey[] = [];
    for (const offer of OFFERS) {
      // Each offer includes everything the cheaper ones do, so a customer never
      // loses a module by paying more.
      carried = [...carried, ...offer.adds];

      const plan = await client.query<{ id: string }>(
        `INSERT INTO plans (id, slug, name, monthly_price, yearly_price, currency,
                            trial_days, is_active, sort_order, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'DZD', 0, true, $5, now(), now())
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           monthly_price = EXCLUDED.monthly_price,
           yearly_price = EXCLUDED.yearly_price,
           is_active = true,
           sort_order = EXCLUDED.sort_order,
           updated_at = now()
         RETURNING id`,
        [offer.slug, offer.name, offer.monthly, offer.yearly, offer.sortOrder]
      );
      const planId = plan.rows[0].id;

      // Rewritten rather than merged: removing a feature from an offer here
      // has to actually remove it, or the seed can only ever add.
      await client.query(`DELETE FROM plan_features WHERE plan_id = $1`, [planId]);
      for (const key of carried) {
        await client.query(
          `INSERT INTO plan_features (id, plan_id, feature_id)
           VALUES (gen_random_uuid(), $1, $2)
           ON CONFLICT (plan_id, feature_id) DO NOTHING`,
          [planId, flagIds.get(key)]
        );
      }

      console.log(
        `  ${offer.name.padEnd(12)} ${(offer.monthly / 100).toLocaleString("fr")} DZD/mois` +
          `  —  ${carried.length} module(s)`
      );
    }

    await client.query("COMMIT");
    console.log("Done. Tenants without an active subscription now see the gated modules as locked.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
