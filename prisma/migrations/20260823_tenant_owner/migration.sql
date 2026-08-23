-- Name the business owner explicitly.
--
-- The account that signs up pays the subscription, hires the employees and
-- hands out their roles. Nothing recorded that: "the owner" could only be
-- inferred as "the oldest user", a deduction that is invisible in the data and
-- breaks the day that row is removed.
--
-- It has to be explicit before anything protects it — and something must,
-- because an admin can today demote or deactivate every other admin and then
-- themselves, leaving the tenant with nobody able to manage it.
--
-- Backfill: the account that created the tenant. Checked against production
-- first — all 29 tenants have users, and in every one the oldest is an active
-- admin, so the rule is unambiguous.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "owner_user_id" TEXT;

UPDATE "tenants" t
   SET "owner_user_id" = (
     SELECT u."id" FROM "users" u
      WHERE u."tenant_id" = t."id"
      ORDER BY u."created_at" ASC
      LIMIT 1
   )
 WHERE t."owner_user_id" IS NULL;

-- SET NULL rather than CASCADE: losing the owner row must never take the whole
-- business with it. The application refuses to delete the owner anyway; this is
-- the floor under that rule, not the rule itself.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_owner_user_id_fkey'
  ) THEN
    ALTER TABLE "tenants"
      ADD CONSTRAINT "tenants_owner_user_id_fkey"
      FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "tenants_owner_user_id_idx" ON "tenants"("owner_user_id");
