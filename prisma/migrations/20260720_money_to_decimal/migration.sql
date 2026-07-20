-- Audit DATA-3: operational money moves from DOUBLE PRECISION (binary float,
-- cannot represent decimal currency exactly) to NUMERIC(16,3). Existing values
-- are rounded to 3 decimals during the conversion — post-wave-1 rows are
-- already 2-decimal-rounded at persistence, so this is a no-op for them; older
-- rows shed sub-millidinar float drift. Rates, percentages and quantities stay
-- DOUBLE PRECISION (they are not money).
--
-- NOTE: invoices issued BEFORE the round2-at-persistence fix may fail
-- verify-integrity after this conversion (their stored hash covers the
-- unrounded float). Run `npx tsx scripts/recompute-invoice-hashes.ts` once
-- after deploying to re-stamp v2 hashes over the converted values.

ALTER TABLE "products"
  ALTER COLUMN "unit_price" TYPE NUMERIC(16,3) USING round("unit_price"::numeric, 3),
  ALTER COLUMN "purchase_price" TYPE NUMERIC(16,3) USING round("purchase_price"::numeric, 3);

ALTER TABLE "product_prices"
  ALTER COLUMN "price" TYPE NUMERIC(16,3) USING round("price"::numeric, 3);

ALTER TABLE "product_variants"
  ALTER COLUMN "price_override" TYPE NUMERIC(16,3) USING round("price_override"::numeric, 3);

ALTER TABLE "quotes"
  ALTER COLUMN "subtotal" TYPE NUMERIC(16,3) USING round("subtotal"::numeric, 3),
  ALTER COLUMN "tax_amount" TYPE NUMERIC(16,3) USING round("tax_amount"::numeric, 3),
  ALTER COLUMN "total" TYPE NUMERIC(16,3) USING round("total"::numeric, 3),
  ALTER COLUMN "shipping_cost" TYPE NUMERIC(16,3) USING round("shipping_cost"::numeric, 3),
  ALTER COLUMN "down_payment_amount" TYPE NUMERIC(16,3) USING round("down_payment_amount"::numeric, 3);

ALTER TABLE "quote_lines"
  ALTER COLUMN "unit_price" TYPE NUMERIC(16,3) USING round("unit_price"::numeric, 3),
  ALTER COLUMN "subtotal" TYPE NUMERIC(16,3) USING round("subtotal"::numeric, 3),
  ALTER COLUMN "tax_amount" TYPE NUMERIC(16,3) USING round("tax_amount"::numeric, 3),
  ALTER COLUMN "total" TYPE NUMERIC(16,3) USING round("total"::numeric, 3);

ALTER TABLE "invoices"
  ALTER COLUMN "subtotal" TYPE NUMERIC(16,3) USING round("subtotal"::numeric, 3),
  ALTER COLUMN "tax_amount" TYPE NUMERIC(16,3) USING round("tax_amount"::numeric, 3),
  ALTER COLUMN "total" TYPE NUMERIC(16,3) USING round("total"::numeric, 3),
  ALTER COLUMN "shipping_cost" TYPE NUMERIC(16,3) USING round("shipping_cost"::numeric, 3),
  ALTER COLUMN "down_payment_amount" TYPE NUMERIC(16,3) USING round("down_payment_amount"::numeric, 3),
  ALTER COLUMN "stamp_duty" TYPE NUMERIC(16,3) USING round("stamp_duty"::numeric, 3);

ALTER TABLE "invoice_lines"
  ALTER COLUMN "unit_price" TYPE NUMERIC(16,3) USING round("unit_price"::numeric, 3),
  ALTER COLUMN "subtotal" TYPE NUMERIC(16,3) USING round("subtotal"::numeric, 3),
  ALTER COLUMN "tax_amount" TYPE NUMERIC(16,3) USING round("tax_amount"::numeric, 3),
  ALTER COLUMN "total" TYPE NUMERIC(16,3) USING round("total"::numeric, 3),
  ALTER COLUMN "cost_price_snapshot" TYPE NUMERIC(16,3) USING round("cost_price_snapshot"::numeric, 3);

ALTER TABLE "payments"
  ALTER COLUMN "amount" TYPE NUMERIC(16,3) USING round("amount"::numeric, 3);

ALTER TABLE "company_settings"
  ALTER COLUMN "stamp_duty_threshold" TYPE NUMERIC(16,3) USING round("stamp_duty_threshold"::numeric, 3);

ALTER TABLE "expenses"
  ALTER COLUMN "amount" TYPE NUMERIC(16,3) USING round("amount"::numeric, 3);

ALTER TABLE "product_suppliers"
  ALTER COLUMN "purchase_price" TYPE NUMERIC(16,3) USING round("purchase_price"::numeric, 3);

ALTER TABLE "purchase_orders"
  ALTER COLUMN "subtotal" TYPE NUMERIC(16,3) USING round("subtotal"::numeric, 3),
  ALTER COLUMN "tax_amount" TYPE NUMERIC(16,3) USING round("tax_amount"::numeric, 3),
  ALTER COLUMN "total" TYPE NUMERIC(16,3) USING round("total"::numeric, 3);

ALTER TABLE "purchase_order_lines"
  ALTER COLUMN "unit_price" TYPE NUMERIC(16,3) USING round("unit_price"::numeric, 3),
  ALTER COLUMN "previous_price" TYPE NUMERIC(16,3) USING round("previous_price"::numeric, 3),
  ALTER COLUMN "subtotal" TYPE NUMERIC(16,3) USING round("subtotal"::numeric, 3),
  ALTER COLUMN "tax_amount" TYPE NUMERIC(16,3) USING round("tax_amount"::numeric, 3),
  ALTER COLUMN "total" TYPE NUMERIC(16,3) USING round("total"::numeric, 3);

ALTER TABLE "supplier_payments"
  ALTER COLUMN "amount" TYPE NUMERIC(16,3) USING round("amount"::numeric, 3);

ALTER TABLE "pos_sessions"
  ALTER COLUMN "opening_float" TYPE NUMERIC(16,3) USING round("opening_float"::numeric, 3),
  ALTER COLUMN "expected_cash" TYPE NUMERIC(16,3) USING round("expected_cash"::numeric, 3),
  ALTER COLUMN "actual_cash" TYPE NUMERIC(16,3) USING round("actual_cash"::numeric, 3),
  ALTER COLUMN "cash_difference" TYPE NUMERIC(16,3) USING round("cash_difference"::numeric, 3);

ALTER TABLE "pos_transactions"
  ALTER COLUMN "subtotal" TYPE NUMERIC(16,3) USING round("subtotal"::numeric, 3),
  ALTER COLUMN "tax_amount" TYPE NUMERIC(16,3) USING round("tax_amount"::numeric, 3),
  ALTER COLUMN "total" TYPE NUMERIC(16,3) USING round("total"::numeric, 3),
  ALTER COLUMN "discount_amount" TYPE NUMERIC(16,3) USING round("discount_amount"::numeric, 3),
  ALTER COLUMN "final_amount" TYPE NUMERIC(16,3) USING round("final_amount"::numeric, 3);

ALTER TABLE "pos_transaction_lines"
  ALTER COLUMN "unit_price" TYPE NUMERIC(16,3) USING round("unit_price"::numeric, 3),
  ALTER COLUMN "subtotal" TYPE NUMERIC(16,3) USING round("subtotal"::numeric, 3),
  ALTER COLUMN "tax_amount" TYPE NUMERIC(16,3) USING round("tax_amount"::numeric, 3),
  ALTER COLUMN "total" TYPE NUMERIC(16,3) USING round("total"::numeric, 3),
  ALTER COLUMN "cost_price_snapshot" TYPE NUMERIC(16,3) USING round("cost_price_snapshot"::numeric, 3);

ALTER TABLE "pos_payments"
  ALTER COLUMN "amount" TYPE NUMERIC(16,3) USING round("amount"::numeric, 3),
  ALTER COLUMN "cash_given" TYPE NUMERIC(16,3) USING round("cash_given"::numeric, 3),
  ALTER COLUMN "change_given" TYPE NUMERIC(16,3) USING round("change_given"::numeric, 3);

ALTER TABLE "pos_cash_movements"
  ALTER COLUMN "amount" TYPE NUMERIC(16,3) USING round("amount"::numeric, 3);

ALTER TABLE "credit_notes"
  ALTER COLUMN "subtotal" TYPE NUMERIC(16,3) USING round("subtotal"::numeric, 3),
  ALTER COLUMN "tax_amount" TYPE NUMERIC(16,3) USING round("tax_amount"::numeric, 3),
  ALTER COLUMN "total" TYPE NUMERIC(16,3) USING round("total"::numeric, 3);

ALTER TABLE "credit_note_lines"
  ALTER COLUMN "unit_price" TYPE NUMERIC(16,3) USING round("unit_price"::numeric, 3),
  ALTER COLUMN "subtotal" TYPE NUMERIC(16,3) USING round("subtotal"::numeric, 3),
  ALTER COLUMN "tax_amount" TYPE NUMERIC(16,3) USING round("tax_amount"::numeric, 3),
  ALTER COLUMN "total" TYPE NUMERIC(16,3) USING round("total"::numeric, 3);
