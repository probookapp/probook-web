-- Droit de timbre only applies to cash-settled invoices, above a configurable
-- TTC threshold. Add a per-invoice cash flag and a configurable threshold so
-- non-cash invoices are no longer over-charged the timbre.
ALTER TABLE "invoices" ADD COLUMN "is_cash_sale" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "company_settings" ADD COLUMN "stamp_duty_threshold" DOUBLE PRECISION DEFAULT 0;

-- Preserve existing behavior: invoices that already carry a timbre snapshot were
-- effectively cash sales, so keep them flagged as such (otherwise a later edit
-- would silently drop their stamp duty).
UPDATE "invoices" SET "is_cash_sale" = true WHERE "stamp_duty" > 0;
