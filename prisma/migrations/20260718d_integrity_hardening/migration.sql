-- Integrity hardening (audit findings DATA-1, DATA-4, DATA-6, DATA-8, DATA-10,
-- POS-1/POS-6, FE-1/SALE-9): idempotency keys for offline-replayed writes,
-- polymorphic audit actor, partial unique indexes for app-only invariants,
-- and missing tenant indexes.

-- ============================================================
-- DATA-1: audit_logs.actor_id must accept tenant-user actors.
-- Drop the FK to platform_admins; the column stays as a polymorphic id.
-- ============================================================
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_actor_id_fkey";

-- ============================================================
-- FE-1 / POS-1 / SALE-9: client-minted idempotency keys so offline replays
-- and lost-response retries cannot double-create money documents.
-- ============================================================
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_tenant_id_idempotency_key_key" ON "invoices"("tenant_id", "idempotency_key");

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "payments_tenant_id_idempotency_key_key" ON "payments"("tenant_id", "idempotency_key");

ALTER TABLE "pos_transactions" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "pos_transactions_tenant_id_idempotency_key_key" ON "pos_transactions"("tenant_id", "idempotency_key");

-- ============================================================
-- DATA-4: product-level stock rows (variant_id IS NULL) are not covered by
-- the composite unique (Postgres treats NULLs as distinct), so duplicates can
-- exist and concurrent upserts race. Merge existing duplicates into the most
-- recently updated row, then enforce uniqueness with a partial index.
-- ============================================================
WITH dups AS (
  SELECT id,
         SUM(quantity) OVER (PARTITION BY location_id, product_id) AS total_qty,
         ROW_NUMBER() OVER (PARTITION BY location_id, product_id ORDER BY updated_at DESC, id) AS rn
  FROM "stock_levels"
  WHERE variant_id IS NULL
),
merged AS (
  UPDATE "stock_levels" s
  SET quantity = d.total_qty
  FROM dups d
  WHERE s.id = d.id AND d.rn = 1
  RETURNING s.id
)
DELETE FROM "stock_levels" s
USING dups d
WHERE s.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "stock_levels_location_id_product_id_no_variant_key"
  ON "stock_levels"("location_id", "product_id")
  WHERE variant_id IS NULL;

-- ============================================================
-- DATA-8: enforce "one default per group" in the database.
-- Keep the oldest default location per tenant and the most recently updated
-- default printer per (tenant, register); clear the rest.
-- ============================================================
UPDATE "locations" SET is_default = false
WHERE is_default AND id NOT IN (
  SELECT DISTINCT ON (tenant_id) id
  FROM "locations"
  WHERE is_default
  ORDER BY tenant_id, created_at ASC, id
);
CREATE UNIQUE INDEX IF NOT EXISTS "locations_one_default_per_tenant_key"
  ON "locations"("tenant_id")
  WHERE is_default;

UPDATE "pos_printer_configs" SET is_default = false
WHERE is_default AND id NOT IN (
  SELECT DISTINCT ON (tenant_id, register_id) id
  FROM "pos_printer_configs"
  WHERE is_default
  ORDER BY tenant_id, register_id, updated_at DESC, id
);
CREATE UNIQUE INDEX IF NOT EXISTS "pos_printer_configs_one_default_per_register_key"
  ON "pos_printer_configs"("tenant_id", "register_id")
  WHERE is_default AND register_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "pos_printer_configs_one_default_no_register_key"
  ON "pos_printer_configs"("tenant_id")
  WHERE is_default AND register_id IS NULL;

-- ============================================================
-- POS-6: at most one OPEN session per register. Close all but the most
-- recently opened OPEN session per register, then enforce with a partial
-- unique index so concurrent opens cannot race past the app check.
-- ============================================================
UPDATE "pos_sessions" SET status = 'CLOSED', closed_at = NOW()
WHERE status = 'OPEN' AND id NOT IN (
  SELECT DISTINCT ON (register_id) id
  FROM "pos_sessions"
  WHERE status = 'OPEN'
  ORDER BY register_id, opened_at DESC, id
);
CREATE UNIQUE INDEX IF NOT EXISTS "pos_sessions_one_open_per_register_key"
  ON "pos_sessions"("register_id")
  WHERE status = 'OPEN';

-- ============================================================
-- DATA-10: cap coupon redemptions at the database level. Clamp any
-- already-over-redeemed counters first so the constraint can be added.
-- ============================================================
UPDATE "coupons" SET current_uses = max_uses
WHERE max_uses IS NOT NULL AND current_uses > max_uses;
ALTER TABLE "coupons" DROP CONSTRAINT IF EXISTS "coupons_uses_within_max_check";
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_uses_within_max_check"
  CHECK (max_uses IS NULL OR current_uses <= max_uses);

-- ============================================================
-- DATA-6 / DATA-13: missing tenant / list-filter indexes on hot tables.
-- ============================================================
CREATE INDEX IF NOT EXISTS "payments_tenant_id_payment_date_idx" ON "payments"("tenant_id", "payment_date");
CREATE INDEX IF NOT EXISTS "reminders_tenant_id_scheduled_date_idx" ON "reminders"("tenant_id", "scheduled_date");
CREATE INDEX IF NOT EXISTS "pos_cash_movements_tenant_id_idx" ON "pos_cash_movements"("tenant_id");
CREATE INDEX IF NOT EXISTS "pos_sessions_tenant_id_idx" ON "pos_sessions"("tenant_id");
CREATE INDEX IF NOT EXISTS "pos_printer_configs_tenant_id_idx" ON "pos_printer_configs"("tenant_id");
CREATE INDEX IF NOT EXISTS "pos_printer_configs_register_id_idx" ON "pos_printer_configs"("register_id");
CREATE INDEX IF NOT EXISTS "invoices_tenant_id_status_idx" ON "invoices"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "pos_transactions_tenant_id_transaction_date_idx" ON "pos_transactions"("tenant_id", "transaction_date");
