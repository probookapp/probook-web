-- Which columns each user has hidden, per list. Nullable: no row is touched.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "table_preferences" JSONB;
ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "table_preferences" JSONB;
