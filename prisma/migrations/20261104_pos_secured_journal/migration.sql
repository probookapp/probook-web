-- Secured cash journal (art. 286 I 3° bis CGI): an append-only, chained record
-- of every customer payment, plus the periodic closures computed from it.
-- See src/lib/pos-journal.ts.

CREATE TABLE IF NOT EXISTS "pos_journal_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "reference_id" TEXT,
    "amount" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "previous_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pos_journal_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pos_journal_entries_tenant_id_sequence_key" ON "pos_journal_entries"("tenant_id", "sequence");
CREATE INDEX IF NOT EXISTS "pos_journal_entries_tenant_id_occurred_at_idx" ON "pos_journal_entries"("tenant_id", "occurred_at");
ALTER TABLE "pos_journal_entries" ADD CONSTRAINT "pos_journal_entries_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "pos_closures" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "period_type" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "first_sequence" INTEGER,
    "last_sequence" INTEGER,
    "entry_count" INTEGER NOT NULL,
    "total_ttc" DECIMAL(16,3) NOT NULL,
    "breakdown" JSONB NOT NULL,
    "grand_total_period" DECIMAL(16,3) NOT NULL,
    "perpetual_total" DECIMAL(16,3) NOT NULL,
    "journal_sequence" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pos_closures_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pos_closures_tenant_id_period_type_period_key_key" ON "pos_closures"("tenant_id", "period_type", "period_key");
CREATE INDEX IF NOT EXISTS "pos_closures_tenant_id_period_type_idx" ON "pos_closures"("tenant_id", "period_type");
ALTER TABLE "pos_closures" ADD CONSTRAINT "pos_closures_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Inaltérabilité at the database level: no UPDATE, ever, and no DELETE except
-- the cascade of a tenant deletion (a referential action runs as a trigger, so
-- it arrives here at trigger depth 2 or more; a direct DELETE arrives at 1).
-- The application has no code path that updates or deletes these rows; this
-- makes sure nothing else can do it without leaving the chain broken.
CREATE OR REPLACE FUNCTION "pos_journal_immutable"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION '% on % is not allowed: the secured cash journal is append-only', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "pos_journal_entries_immutable" ON "pos_journal_entries";
CREATE TRIGGER "pos_journal_entries_immutable"
    BEFORE UPDATE OR DELETE ON "pos_journal_entries"
    FOR EACH ROW EXECUTE FUNCTION "pos_journal_immutable"();

DROP TRIGGER IF EXISTS "pos_closures_immutable" ON "pos_closures";
CREATE TRIGGER "pos_closures_immutable"
    BEFORE UPDATE OR DELETE ON "pos_closures"
    FOR EACH ROW EXECUTE FUNCTION "pos_journal_immutable"();
