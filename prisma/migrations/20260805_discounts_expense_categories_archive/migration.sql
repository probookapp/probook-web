-- Three additions, all strictly additive (no column renamed or dropped):
--
--  1. expense_categories — user-defined expense headings (fuel, rent...), so a
--     recurring charge is picked instead of retyped, and expenses become
--     analysable by heading instead of being a flat list of free text.
--  2. Commercial discounts on quotes and invoices, per line and on the document.
--     Stored rather than folded into the price so the document stays
--     reconstructable from its own lines — a total that is not the sum of its
--     lines is not a valid fiscal document.
--  3. archived_at — settled documents get put away without ever being deleted.

CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_categories_tenant_id_idx" ON "expense_categories"("tenant_id");
CREATE UNIQUE INDEX "expense_categories_tenant_id_name_key" ON "expense_categories"("tenant_id", "name");

ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expenses" ADD COLUMN "category_id" TEXT;
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- SET NULL, not CASCADE: deleting a heading must never delete the spending
-- recorded under it.
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Discounts. Percent applies to the pre-tax base first, then the fixed amount.
ALTER TABLE "quotes" ADD COLUMN "discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "quotes" ADD COLUMN "discount_amount" DECIMAL(16,3) NOT NULL DEFAULT 0;
ALTER TABLE "quote_lines" ADD COLUMN "discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "invoices" ADD COLUMN "discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "discount_amount" DECIMAL(16,3) NOT NULL DEFAULT 0;
ALTER TABLE "invoice_lines" ADD COLUMN "discount_percent" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "quotes" ADD COLUMN "archived_at" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "archived_at" TIMESTAMP(3);
