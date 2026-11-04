-- French e-invoicing mentions and the data Factur-X (EN 16931) needs.
-- All nullable or defaulted: existing invoices are unchanged.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "delivery_address" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "operation_nature" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "vat_exemption" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "vat_exemption_note" TEXT;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "vat_on_debits" BOOLEAN NOT NULL DEFAULT false;
