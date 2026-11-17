-- A deposit taken on a quote is a payment with no invoice yet: it carries the
-- quote, and gets the invoice once the quote is converted (same row, so its
-- secured journal entry is never duplicated).
ALTER TABLE "payments" ALTER COLUMN "invoice_id" DROP NOT NULL;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "quote_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Money received always belongs to something: an invoice, or a quote waiting
-- to become one.
DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_or_quote_check"
    CHECK ("invoice_id" IS NOT NULL OR "quote_id" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "payments_quote_id_idx" ON "payments"("quote_id");
