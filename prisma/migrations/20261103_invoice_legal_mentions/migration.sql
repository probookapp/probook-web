-- Legal mentions printed automatically per fiscal profile (src/lib/legal-mentions.ts).
-- Every column is nullable or defaulted: existing documents print as before
-- until a tenant fills them in.
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "legal_form" TEXT;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "share_capital" DECIMAL(16,3);
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "activity" TEXT;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "vat_franchise" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "late_penalty_rate" TEXT;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "early_payment_discount" TEXT;

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "is_consumer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "legal_form" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "activity" TEXT;

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
