-- Which variant a document line is about.
--
-- Stock is kept per variant, and until now only the till and purchase orders
-- said which one they moved. A quote, an invoice or a delivery note named the
-- product alone, so issuing an invoice for "T-shirt — Rouge XL" took the goods
-- out of a product-level row that holds nothing, and the red shirt's own count
-- never went down.
--
-- SET NULL, not RESTRICT: a variant can be deleted from the product page, and a
-- signed document must survive that. Its description already names the variant.
ALTER TABLE "quote_lines" ADD COLUMN IF NOT EXISTS "variant_id" TEXT;
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "variant_id" TEXT;
ALTER TABLE "delivery_note_lines" ADD COLUMN IF NOT EXISTS "variant_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;