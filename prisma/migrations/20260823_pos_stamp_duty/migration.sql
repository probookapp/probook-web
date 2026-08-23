-- The till carries its droit de timbre, like an invoice does.
--
-- Article 100 of the Code du timbre covers "each transaction made with an
-- invoice OR a receipt whose payment is made in cash". A till ticket is a
-- receipt, so the duty is due — the register simply never computed it, and the
-- tax report could not show what was never recorded.
--
-- Circular n° 14/MF/DGI/LF.2025 of 5 March 2025 settles the two questions the
-- code had left open: the duty is computed on the sum settled IN CASH (the
-- electronically-paid part is exempt under art. 258 quinquies), and the scale is
-- not progressive per bracket — the rate of the bracket reached applies to the
-- whole amount.
ALTER TABLE "pos_transactions"
  ADD COLUMN IF NOT EXISTS "stamp_duty" DECIMAL(16,3) NOT NULL DEFAULT 0;
