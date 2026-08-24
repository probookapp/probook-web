-- Seats bought on a subscription, overriding the plan's max_users quota.
--
-- Without this, selling one extra seat to a business on Commerce means minting
-- a private plan for that one customer — a new row in the offer catalogue for
-- every hire. Nullable so every existing subscription keeps deferring to its
-- offer, which is what they all do today.
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "seats" INTEGER;
