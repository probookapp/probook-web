-- Who recorded an expense, and how it was paid. Both stay null on the rows
-- that predate them: the author is unknown, and so is the method, which keeps
-- those expenses out of the cash journal rather than guessing "cash".
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "expenses_created_by_id_idx" ON "expenses"("created_by_id");
