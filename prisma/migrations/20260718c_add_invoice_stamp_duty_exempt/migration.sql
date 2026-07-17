-- Per-invoice legal exemption from droit de timbre: when set, no timbre is
-- applied even to a cash sale above the threshold.
ALTER TABLE "invoices" ADD COLUMN "stamp_duty_exempt" BOOLEAN NOT NULL DEFAULT false;
