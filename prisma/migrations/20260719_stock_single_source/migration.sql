-- ===== StockLevel becomes the single source of truth for inventory (DATA-5) =====
--
-- Drops the two aggregate on-hand columns (products.quantity,
-- product_variants.quantity). On-hand is computed from stock_levels from now on.
--
-- BEFORE dropping, backfill stock_levels for any stock that lives ONLY in the
-- aggregates: tenants from before the multi-location migration (20260715c) may
-- hold on-hand there without a corresponding stock_levels row. Every backfill
-- statement is conditioned on "no stock_levels row exists yet", so re-running
-- (or running against an already-consistent database) inserts nothing.

-- 1. Tenants that have products but no locations at all get a default 'Main'
--    location. Only tenants with ZERO locations qualify, so this can never
--    collide with the partial unique index locations_one_default_per_tenant_key
--    (tenant_id WHERE is_default).
INSERT INTO "locations" ("id", "tenant_id", "name", "type", "is_default", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), t."id", 'Main', 'store', true, true, now(), now()
FROM "tenants" t
WHERE EXISTS (SELECT 1 FROM "products" p WHERE p."tenant_id" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "locations" l WHERE l."tenant_id" = t."id");

-- 2. Seed missing product-level rows: non-variant products whose aggregate
--    quantity is non-zero but which have NO product-level stock_levels row at
--    any location. Seeded at the tenant's preferred location (default first,
--    then oldest).
INSERT INTO "stock_levels" ("id", "tenant_id", "location_id", "product_id", "variant_id", "quantity", "updated_at")
SELECT gen_random_uuid(), p."tenant_id", loc."id", p."id", NULL, p."quantity", now()
FROM "products" p
CROSS JOIN LATERAL (
  SELECT l."id"
  FROM "locations" l
  WHERE l."tenant_id" = p."tenant_id"
  ORDER BY l."is_default" DESC, l."created_at" ASC
  LIMIT 1
) loc
WHERE p."has_variants" = false
  AND p."quantity" IS NOT NULL
  AND p."quantity" <> 0
  AND NOT EXISTS (
    SELECT 1 FROM "stock_levels" sl
    WHERE sl."product_id" = p."id" AND sl."variant_id" IS NULL
  );

-- 3. Same for variants: aggregate quantity non-zero, no stock_levels row for
--    that variant anywhere.
INSERT INTO "stock_levels" ("id", "tenant_id", "location_id", "product_id", "variant_id", "quantity", "updated_at")
SELECT gen_random_uuid(), v."tenant_id", loc."id", v."product_id", v."id", v."quantity", now()
FROM "product_variants" v
CROSS JOIN LATERAL (
  SELECT l."id"
  FROM "locations" l
  WHERE l."tenant_id" = v."tenant_id"
  ORDER BY l."is_default" DESC, l."created_at" ASC
  LIMIT 1
) loc
WHERE v."quantity" <> 0
  AND NOT EXISTS (
    SELECT 1 FROM "stock_levels" sl
    WHERE sl."variant_id" = v."id"
  );

-- 4. Drop the aggregate columns — stock_levels is now the only on-hand store.
ALTER TABLE "products" DROP COLUMN IF EXISTS "quantity";
ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "quantity";
