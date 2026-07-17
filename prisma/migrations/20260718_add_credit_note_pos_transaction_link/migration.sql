-- Link POS-refund credit notes back to the sale so cumulative refunds can be
-- capped (no refunding more than was sold) and drawer reconciliation is correct.
ALTER TABLE "credit_notes" ADD COLUMN "pos_transaction_id" TEXT;

CREATE INDEX "credit_notes_pos_transaction_id_idx" ON "credit_notes"("pos_transaction_id");

ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_pos_transaction_id_fkey" FOREIGN KEY ("pos_transaction_id") REFERENCES "pos_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
