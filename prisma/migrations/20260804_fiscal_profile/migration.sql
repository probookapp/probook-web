-- Country fiscal profile (Algeria by default) + the two Algerian identifiers
-- that had no home yet (NIS, ART).
--
-- Strictly additive: no column is renamed or dropped, so existing tenants keep
-- their SIRET / VAT number untouched. The profile only changes how those two
-- columns are LABELLED and which VAT scale is offered:
--   DZ  siret -> RC, vat_number -> NIF, plus nis / art
--   FR  siret -> SIRET, vat_number -> N° TVA intracommunautaire
--
-- Existing rows are backfilled to 'FR' rather than the new 'DZ' default: they
-- were created while the app offered French VAT rates and euro amounts, so
-- flipping them to the Algerian regime would relabel their stored identifiers.
-- New sign-ups get 'DZ' from the column default.

ALTER TABLE "company_settings" ADD COLUMN "nis" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "art" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "fiscal_profile" TEXT NOT NULL DEFAULT 'DZ';

ALTER TABLE "clients" ADD COLUMN "nis" TEXT;
ALTER TABLE "clients" ADD COLUMN "art" TEXT;

UPDATE "company_settings" SET "fiscal_profile" = 'FR';

-- Defaults for newly created tenants only; existing rows keep their values.
ALTER TABLE "company_settings" ALTER COLUMN "currency" SET DEFAULT 'DZD';
ALTER TABLE "company_settings" ALTER COLUMN "default_tax_rate" SET DEFAULT 19.0;
ALTER TABLE "company_settings" ALTER COLUMN "app_language" SET DEFAULT 'fr';
