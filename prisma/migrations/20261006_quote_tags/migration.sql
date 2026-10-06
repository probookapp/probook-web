-- Free labels a business invents for itself, on a second axis from the status.
--
-- "Can we add our own statuses?" is almost always this question. It cannot be
-- answered on `quotes.status`: that column is a state machine the expiry sweep,
-- the relance alerts, the conversion to an invoice and the conversion-rate
-- report all read, so a quote parked in an invented state silently falls out of
-- every one of them. A tag classifies without changing what the document is —
-- the same separation `archived_at` already makes.
CREATE TABLE "tags" (
    "id"         TEXT NOT NULL,
    "tenant_id"  TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    -- A key from src/lib/tag-colors.ts, not a hex: six hues, each with a
    -- dark-theme counterpart. A freely picked colour is unreadable in one theme.
    "color"      TEXT NOT NULL DEFAULT 'gray',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tags_tenant_id_name_key" ON "tags"("tenant_id", "name");
CREATE INDEX "tags_tenant_id_idx" ON "tags"("tenant_id");

ALTER TABLE "tags"
    ADD CONSTRAINT "tags_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "quote_tags" (
    "quote_id" TEXT NOT NULL,
    "tag_id"   TEXT NOT NULL,

    CONSTRAINT "quote_tags_pkey" PRIMARY KEY ("quote_id", "tag_id")
);

CREATE INDEX "quote_tags_tag_id_idx" ON "quote_tags"("tag_id");

-- Cascades both ways: deleting a quote drops its labels, and retiring a label
-- removes it from the documents that wore it. Neither is a document change.
ALTER TABLE "quote_tags"
    ADD CONSTRAINT "quote_tags_quote_id_fkey" FOREIGN KEY ("quote_id")
    REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_tags"
    ADD CONSTRAINT "quote_tags_tag_id_fkey" FOREIGN KEY ("tag_id")
    REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
