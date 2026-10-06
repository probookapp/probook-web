-- No currency is assumed by the database any more.
--
-- Every currency column defaulted to 'DZD', so a row written without one was
-- silently priced in dinars — the same assumption the application used to make
-- in a dozen places, and the one that printed dirhams on every fixed coupon.
-- The application now names the currency on every write (src/lib/currencies.ts):
-- the catalogue's reference currency, the tenant's own, or the one an offer was
-- quoted in. A write that forgets is now an error instead of a wrong price.
--
-- Existing rows keep the currency they have; only the default is dropped.
ALTER TABLE "company_settings"      ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "plans"                 ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "subscriptions"         ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "subscription_requests" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "coupons"               ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "subscription_invoices" ALTER COLUMN "currency" DROP DEFAULT;
