/**
 * Installs the offers, the entitlement flags they carry, and retires the ones
 * they replace.
 *
 * Run deliberately, never automatically, and only AFTER the code that reads
 * these rows is deployed:
 *
 *   npx dotenv -e .env.test -- npx tsx scripts/seed-plans.ts
 *   npx dotenv -e .env     -- npx tsx scripts/seed-plans.ts --yes   (production)
 *
 * ORDER MATTERS, AND NOT ONLY HERE. `feature-gate.ts` allows everything while a
 * flag does not exist, so creating a flag before an offer carries it refuses
 * that feature to every tenant at once. Deploying the enforcing code before
 * this script runs is safe — no flag means no restriction — but running this
 * before the deploy is not, because the old code has no trial rule.
 *
 * Inside the script the same care applies: subscriptions are moved to their new
 * offer BEFORE the old offers are retired, so no tenant is ever left pointing at
 * an offer that has ceased to exist.
 *
 * Prices are in centimes, the unit the Plan model stores.
 */
import { Client } from "pg";
import { FEATURE_KEYS, type FeatureKey } from "../src/lib/feature-keys";

interface Offer {
  slug: string;
  /** English is the base name; the rest is `nameTranslations`. */
  name: string;
  fr: string;
  ar: string;
  monthly: number;
  yearly: number;
  sortOrder: number;
  /** What this offer adds. Each offer also carries everything before it. */
  adds: FeatureKey[];
  /** How many user accounts it covers. null = no ceiling. */
  maxUsers: number | null;
}

const OFFERS: Offer[] = [
  {
    slug: "essential",
    name: "Essential",
    fr: "Essentiel",
    ar: "الأساسي",
    monthly: 190_000,
    yearly: 1_900_000,
    sortOrder: 1,
    // Nothing here, and that is not an oversight: the entry offer is the core
    // product — invoicing, quotes, credit notes, the catalogue, the dashboard,
    // the basic reports — none of which is ever sold separately. `adds` lists
    // what an offer puts on top of that.
    adds: [],
    maxUsers: 1,
  },
  {
    slug: "commerce",
    name: "Commerce",
    fr: "Commerce",
    ar: "التجارة",
    monthly: 390_000,
    yearly: 3_900_000,
    sortOrder: 2,
    adds: [
      FEATURE_KEYS.POS,
      FEATURE_KEYS.PURCHASING,
      FEATURE_KEYS.DELIVERY_NOTES,
      FEATURE_KEYS.EXPENSES,
      FEATURE_KEYS.IMPORT_EXPORT,
    ],
    maxUsers: 3,
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    fr: "Entreprise",
    ar: "المؤسسة",
    monthly: 790_000,
    yearly: 7_900_000,
    sortOrder: 3,
    adds: [
      FEATURE_KEYS.MULTI_LOCATION,
      FEATURE_KEYS.ADVANCED_REPORTS,
      FEATURE_KEYS.REMINDERS,
      FEATURE_KEYS.PHONEBOOK,
    ],
    maxUsers: null,
  },
];

/**
 * The offers these replace, and where their subscribers go.
 *
 * `shop` carried delivery notes, expenses and quotes; Commerce carries the first
 * two and adds the till, purchasing and import. Nobody loses anything they were
 * using.
 *
 * `enterprise` is not in this list: the slug already exists, with no subscriber,
 * so the upsert above repriced and refilled that same row rather than leaving a
 * second Enterprise beside it.
 *
 * Retiring is a deactivation, never a delete: subscriptions and their invoices
 * keep pointing at the row.
 */
const RETIRE = ["shop"];
const MIGRATE_TO = "commerce";

/**
 * What a customer calls each module. English is the base name — the language the
 * offers are written in — and the rest lives in `nameTranslations`, which is what
 * the pricing page and the navigation read.
 */
/**
 * What each module costs on its own, per month, in centimes.
 *
 * Calibrated so the tipping point sits at three modules: one or two are cheaper
 * composed, three or more and the bundle wins. Set them lower and assembling
 * Commerce à la carte would undercut Commerce; set them higher and nobody
 * composes. See src/lib/alacarte.ts, where the arithmetic and its tests live.
 *
 * Two tiers, matching the offer each module arrives in: 700 for a Commerce
 * module, 1 400 for an Enterprise one.
 */
const COMMERCE_MODULE = 70_000;
const ENTERPRISE_MODULE = 140_000;

const FEATURE_UNIT_PRICES: Record<FeatureKey, number> = {
  [FEATURE_KEYS.POS]: COMMERCE_MODULE,
  [FEATURE_KEYS.PURCHASING]: COMMERCE_MODULE,
  [FEATURE_KEYS.DELIVERY_NOTES]: COMMERCE_MODULE,
  [FEATURE_KEYS.EXPENSES]: COMMERCE_MODULE,
  [FEATURE_KEYS.IMPORT_EXPORT]: COMMERCE_MODULE,
  [FEATURE_KEYS.MULTI_LOCATION]: ENTERPRISE_MODULE,
  [FEATURE_KEYS.ADVANCED_REPORTS]: ENTERPRISE_MODULE,
  [FEATURE_KEYS.REMINDERS]: ENTERPRISE_MODULE,
  [FEATURE_KEYS.PHONEBOOK]: ENTERPRISE_MODULE,
};

const FEATURE_NAMES: Record<FeatureKey, { en: string; fr: string; ar: string }> = {
  [FEATURE_KEYS.POS]: { en: "Point of Sale", fr: "Caisse", ar: "الصندوق" },
  [FEATURE_KEYS.PURCHASING]: {
    en: "Purchasing & Suppliers", fr: "Achats et fournisseurs", ar: "المشتريات والموردون",
  },
  [FEATURE_KEYS.DELIVERY_NOTES]: {
    en: "Delivery Notes", fr: "Bons de livraison", ar: "سندات التسليم",
  },
  [FEATURE_KEYS.EXPENSES]: { en: "Expense Tracking", fr: "Dépenses", ar: "المصاريف" },
  [FEATURE_KEYS.MULTI_LOCATION]: {
    en: "Multi-site Stock", fr: "Stock multi-sites", ar: "المخزون متعدّد المواقع",
  },
  [FEATURE_KEYS.ADVANCED_REPORTS]: {
    en: "Advanced Reports", fr: "Rapports avancés", ar: "التقارير المتقدّمة",
  },
  [FEATURE_KEYS.REMINDERS]: {
    en: "Payment Reminders", fr: "Relances clients", ar: "تذكيرات الدفع",
  },
  [FEATURE_KEYS.PHONEBOOK]: {
    en: "Phonebook & Contacts", fr: "Annuaire et contacts", ar: "دليل جهات الاتصال",
  },
  [FEATURE_KEYS.IMPORT_EXPORT]: {
    en: "Import & Backup", fr: "Import et sauvegarde", ar: "الاستيراد والنسخ الاحتياطي",
  },
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const isTestDatabase = /\/probook_test(\?|$)/.test(url);
  // Against anything else this changes what real customers can do, so it has to
  // be asked for in words.
  if (!isTestDatabase && !process.argv.includes("--yes")) {
    throw new Error(
      `Refusing to seed ${url.replace(/:[^:@/]*@/, ":***@")} without --yes.\n` +
        "This rewrites the offers and moves live subscriptions."
    );
  }

  console.log(`Seeding offers into ${url.replace(/:[^:@/]*@/, ":***@").slice(0, 70)}`);

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");

    // ─── the entitlement catalogue ───
    const flagIds = new Map<FeatureKey, string>();
    for (const [key, label] of Object.entries(FEATURE_NAMES) as [
      FeatureKey,
      { en: string; fr: string; ar: string },
    ][]) {
      const res = await client.query<{ id: string }>(
        `INSERT INTO feature_flags (id, key, name, name_translations, is_global,
                                    unit_price, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, false, $4, now(), now())
         ON CONFLICT (key) DO UPDATE SET
           name = EXCLUDED.name,
           name_translations = EXCLUDED.name_translations,
           is_global = false,
           unit_price = EXCLUDED.unit_price,
           updated_at = now()
         RETURNING id`,
        [key, label.en, JSON.stringify({ fr: label.fr, ar: label.ar }), FEATURE_UNIT_PRICES[key]]
      );
      flagIds.set(key, res.rows[0].id);
    }

    // ─── the offers ───
    const planIds = new Map<string, string>();
    let carried: FeatureKey[] = [];
    for (const offer of OFFERS) {
      // Each offer includes everything the cheaper ones do, so a customer never
      // loses a module by paying more.
      carried = [...carried, ...offer.adds];

      const plan = await client.query<{ id: string }>(
        `INSERT INTO plans (id, slug, name, name_translations, monthly_price, yearly_price,
                            currency, trial_days, is_active, sort_order, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $6, $3, $4, 'DZD', 0, true, $5, now(), now())
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           name_translations = EXCLUDED.name_translations,
           monthly_price = EXCLUDED.monthly_price,
           yearly_price = EXCLUDED.yearly_price,
           is_active = true,
           sort_order = EXCLUDED.sort_order,
           updated_at = now()
         RETURNING id`,
        [offer.slug, offer.name, offer.monthly, offer.yearly, offer.sortOrder,
         JSON.stringify({ fr: offer.fr, ar: offer.ar })]
      );
      const planId = plan.rows[0].id;
      planIds.set(offer.slug, planId);

      // Rewritten rather than merged: removing a feature from an offer here has
      // to actually remove it, or the seed can only ever add.
      await client.query(`DELETE FROM plan_features WHERE plan_id = $1`, [planId]);
      for (const key of carried) {
        await client.query(
          `INSERT INTO plan_features (id, plan_id, feature_id)
           VALUES (gen_random_uuid(), $1, $2)
           ON CONFLICT (plan_id, feature_id) DO NOTHING`,
          [planId, flagIds.get(key)]
        );
      }

      // Quotas are the other half of an offer: how much, not whether. Rewritten
      // like the feature links, so lowering a ceiling here actually lowers it.
      await client.query(`DELETE FROM plan_quotas WHERE plan_id = $1`, [planId]);
      if (offer.maxUsers !== null) {
        await client.query(
          `INSERT INTO plan_quotas (id, plan_id, quota_key, limit_value)
           VALUES (gen_random_uuid(), $1, 'max_users', $2)
           ON CONFLICT (plan_id, quota_key) DO UPDATE SET limit_value = EXCLUDED.limit_value`,
          [planId, offer.maxUsers]
        );
      }

      console.log(
        `  ${offer.name.padEnd(12)} ${(offer.monthly / 100).toLocaleString("fr-FR")} DZD/mois` +
          `  —  ${carried.length} module(s)` +
          `, ${offer.maxUsers ?? "∞"} utilisateur(s)`
      );
    }

    // ─── the offers these replace ───
    const target = planIds.get(MIGRATE_TO);
    if (!target) throw new Error(`${MIGRATE_TO} is not one of the seeded offers.`);

    // Moved first. Retiring the old offer while a live subscription still points
    // at it would leave that tenant on an offer nobody can subscribe to.
    const moved = await client.query(
      `UPDATE subscriptions SET plan_id = $1, updated_at = now()
        WHERE status = 'active'
          AND plan_id IN (SELECT id FROM plans WHERE slug = ANY($2))`,
      [target, RETIRE]
    );

    const retired = await client.query(
      `UPDATE plans SET is_active = false, updated_at = now()
        WHERE slug = ANY($1) AND is_active`,
      [RETIRE]
    );

    await client.query("COMMIT");

    console.log(
      `\n  ${moved.rowCount} live subscription(s) moved to ${MIGRATE_TO}` +
        `, ${retired.rowCount} offer(s) retired`
    );
    console.log(
      "Done. Tenants outside their trial with no active subscription now see the " +
        "gated modules under the offer that carries them."
    );
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
