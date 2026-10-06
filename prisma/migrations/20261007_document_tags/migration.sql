-- The same labels on invoices and delivery notes.
--
-- Labels arrived on quotes first (20261006_quote_tags) because that is where the
-- request came from, but a job called "Chantier Hydra" is the same job whichever
-- document is in front of you. One vocabulary, three join tables: a second list
-- of labels to maintain would drift from the first within a week.
--
-- One table per document type rather than a polymorphic (document_type,
-- document_id) pair: a foreign key that actually constrains, and a cascade that
-- actually fires, are worth more than the two tables saved. The alternative
-- leaves rows pointing at documents that no longer exist and no way to notice.
CREATE TABLE "invoice_tags" (
    "invoice_id" TEXT NOT NULL,
    "tag_id"     TEXT NOT NULL,

    CONSTRAINT "invoice_tags_pkey" PRIMARY KEY ("invoice_id", "tag_id")
);

CREATE INDEX "invoice_tags_tag_id_idx" ON "invoice_tags"("tag_id");

ALTER TABLE "invoice_tags"
    ADD CONSTRAINT "invoice_tags_invoice_id_fkey" FOREIGN KEY ("invoice_id")
    REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_tags"
    ADD CONSTRAINT "invoice_tags_tag_id_fkey" FOREIGN KEY ("tag_id")
    REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "delivery_note_tags" (
    "delivery_note_id" TEXT NOT NULL,
    "tag_id"           TEXT NOT NULL,

    CONSTRAINT "delivery_note_tags_pkey" PRIMARY KEY ("delivery_note_id", "tag_id")
);

CREATE INDEX "delivery_note_tags_tag_id_idx" ON "delivery_note_tags"("tag_id");

ALTER TABLE "delivery_note_tags"
    ADD CONSTRAINT "delivery_note_tags_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id")
    REFERENCES "delivery_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_note_tags"
    ADD CONSTRAINT "delivery_note_tags_tag_id_fkey" FOREIGN KEY ("tag_id")
    REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
