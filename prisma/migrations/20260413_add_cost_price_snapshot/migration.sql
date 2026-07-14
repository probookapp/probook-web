-- Freeze the product purchase price on each sale line so later changes to
-- Product.purchase_price do not rewrite historical COGS / profit figures.
ALTER TABLE "invoice_lines" ADD COLUMN "cost_price_snapshot" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "pos_transaction_lines" ADD COLUMN "cost_price_snapshot" DOUBLE PRECISION NOT NULL DEFAULT 0;
