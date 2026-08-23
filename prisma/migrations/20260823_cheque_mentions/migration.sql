-- The mentions article 258 requires for a cheque to be exempt.
--
-- A receipt for a sum settled by cheque drawn on a banker is exempt from the
-- droit de timbre — but the article grants that exemption "à condition de
-- mentionner" the cheque's date, its number, and the name of the drawee.
--
-- Probook had one free-text `reference` field, and on the till it was even
-- called `card_reference`. So the amount was right and the document did not
-- prove why: a quittance without the prescribed mentions does not meet the
-- condition, and it is the merchant who carries the difference.
--
-- The cheque's own date, not the day it was banked: `payment_date` is when the
-- money was taken, and the two almost never match.
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "cheque_date"   DATE,
  ADD COLUMN IF NOT EXISTS "cheque_number" TEXT,
  ADD COLUMN IF NOT EXISTS "cheque_bank"   TEXT;

ALTER TABLE "pos_payments"
  ADD COLUMN IF NOT EXISTS "cheque_date"   DATE,
  ADD COLUMN IF NOT EXISTS "cheque_number" TEXT,
  ADD COLUMN IF NOT EXISTS "cheque_bank"   TEXT;
