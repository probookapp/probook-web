-- Whether a pack lists its components on quote and invoice PDFs. Defaults to
-- true: documents print exactly as before until a tenant turns it off.
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "print_bundle_detail" BOOLEAN NOT NULL DEFAULT true;
