-- Opening balances of the cash journal: what the business held in cash, in
-- cheques not yet banked and at the bank on the day it starts following its
-- money in the app (src/lib/cash-journal.ts).
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "cash_journal_start" DATE;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "opening_cash" DECIMAL(16,3) NOT NULL DEFAULT 0;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "opening_cheques" DECIMAL(16,3) NOT NULL DEFAULT 0;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "opening_bank" DECIMAL(16,3) NOT NULL DEFAULT 0;
