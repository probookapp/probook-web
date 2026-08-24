-- The à la carte price of a single module, per month, in centimes.
--
-- Null on every existing row on purpose: a module with no price is not sold
-- separately and never reaches the composer. Filling this in is a deliberate
-- act in the admin panel, not something a migration guesses.
ALTER TABLE "feature_flags" ADD COLUMN IF NOT EXISTS "unit_price" INTEGER;
