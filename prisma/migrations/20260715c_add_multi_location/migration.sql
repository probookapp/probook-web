-- ===== Multi-location / warehouses + dashboard layout =====

-- Dashboard layout (cross-device dashboard customization)
ALTER TABLE "company_settings" ADD COLUMN "dashboard_layout" JSONB;

-- New columns on existing tables
ALTER TABLE "pos_registers" ADD COLUMN "location_id" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "location_id" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN "location_id" TEXT;

-- CreateTable: locations
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'store',
    "address" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stock_levels
CREATE TABLE "stock_levels" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stock_transfers
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transfer_number" TEXT NOT NULL,
    "from_location_id" TEXT NOT NULL,
    "to_location_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stock_transfer_lines
CREATE TABLE "stock_transfer_lines" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "locations_tenant_id_idx" ON "locations"("tenant_id");
CREATE UNIQUE INDEX "stock_levels_location_id_product_id_variant_id_key" ON "stock_levels"("location_id", "product_id", "variant_id");
CREATE INDEX "stock_levels_tenant_id_product_id_idx" ON "stock_levels"("tenant_id", "product_id");
CREATE INDEX "stock_levels_location_id_idx" ON "stock_levels"("location_id");
CREATE UNIQUE INDEX "stock_transfers_tenant_id_transfer_number_key" ON "stock_transfers"("tenant_id", "transfer_number");
CREATE INDEX "stock_transfers_tenant_id_idx" ON "stock_transfers"("tenant_id");
CREATE INDEX "stock_transfer_lines_transfer_id_idx" ON "stock_transfer_lines"("transfer_id");

-- Foreign keys
ALTER TABLE "pos_registers" ADD CONSTRAINT "pos_registers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Backfill: give every tenant a default "Main" location and migrate on-hand stock =====

-- 1. One default location per tenant
INSERT INTO "locations" ("id", "tenant_id", "name", "type", "is_default", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), t."id", 'Main', 'store', true, true, now(), now()
FROM "tenants" t;

-- 2. Stock levels from product-level quantities (products without variants)
INSERT INTO "stock_levels" ("id", "tenant_id", "location_id", "product_id", "variant_id", "quantity", "updated_at")
SELECT gen_random_uuid(), p."tenant_id", l."id", p."id", NULL, COALESCE(p."quantity", 0), now()
FROM "products" p
JOIN "locations" l ON l."tenant_id" = p."tenant_id" AND l."is_default" = true
WHERE p."has_variants" = false;

-- 3. Stock levels from variant quantities
INSERT INTO "stock_levels" ("id", "tenant_id", "location_id", "product_id", "variant_id", "quantity", "updated_at")
SELECT gen_random_uuid(), v."tenant_id", l."id", v."product_id", v."id", COALESCE(v."quantity", 0), now()
FROM "product_variants" v
JOIN "locations" l ON l."tenant_id" = v."tenant_id" AND l."is_default" = true;

-- 4. Point existing POS registers at the default location
UPDATE "pos_registers" pr
SET "location_id" = l."id"
FROM "locations" l
WHERE l."tenant_id" = pr."tenant_id" AND l."is_default" = true;
