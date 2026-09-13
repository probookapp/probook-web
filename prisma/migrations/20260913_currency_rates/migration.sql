-- What one dinar is worth elsewhere.
--
-- Prices are written once, in DZD. Publishing them abroad by typing a second
-- set of figures is what let Enterprise be reseeded at 7 900 DZD while a
-- leftover row went on selling it at 30 EUR: two numbers with no relationship
-- to keep, and nothing able to notice they had parted.
--
-- Empty on purpose. A currency with no rate is not offered — which is the
-- honest default, and better than inventing one.
CREATE TABLE IF NOT EXISTS "currency_rates" (
  "code"       TEXT NOT NULL,
  "per_dzd"    DECIMAL(18,8) NOT NULL,
  "round_to"   INTEGER NOT NULL DEFAULT 100,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "currency_rates_pkey" PRIMARY KEY ("code")
);
