-- Stock quantities become fractional.
--
-- The catalogue offers kg, metre, square metre, cubic metre and litre as units,
-- and the till accepts 0.01 steps for them. The ledger did not: every stock
-- write went through Math.round, so selling 0.4 m decremented nothing and
-- selling 2.6 m removed 3. Six products in production are sold by the metre.
--
-- Document line quantities have always been double precision — this aligns the
-- ledger with the documents that feed it. Widening an integer column loses
-- nothing, so the migration is safe to replay and needs no data backfill.
ALTER TABLE "stock_levels"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;

ALTER TABLE "stock_movements"
  ALTER COLUMN "quantity_change" TYPE DOUBLE PRECISION,
  ALTER COLUMN "balance_after" TYPE DOUBLE PRECISION;

ALTER TABLE "stock_transfer_lines"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;
