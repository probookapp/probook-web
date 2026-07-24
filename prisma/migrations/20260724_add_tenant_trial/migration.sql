-- Trial support on tenants: a time-limited free-trial window independent of the
-- Subscription table. When trial_ends_at is in the future and the tenant has no
-- active subscription, the app grants full (non-demo) access until it lapses.
ALTER TABLE "tenants" ADD COLUMN "trial_started_at" TIMESTAMP(3);
ALTER TABLE "tenants" ADD COLUMN "trial_ends_at" TIMESTAMP(3);

-- Backfill: grant a 10-day trial (starting now) to recently-created tenants that
-- signed up but never obtained any subscription. This re-engages abandoned
-- signups from the current campaign without reviving very old / dead accounts.
UPDATE "tenants" t
SET "trial_started_at" = NOW(),
    "trial_ends_at" = NOW() + INTERVAL '10 days'
WHERE t."status" <> 'suspended'
  AND t."created_at" > NOW() - INTERVAL '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM "subscriptions" s WHERE s."tenant_id" = t."id"
  );
