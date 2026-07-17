-- Per-invoice stamp duty (droit de timbre) snapshot for cash invoices
ALTER TABLE "invoices" ADD COLUMN "stamp_duty" DOUBLE PRECISION NOT NULL DEFAULT 0;
