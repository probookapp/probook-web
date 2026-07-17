-- Stamp duty (droit de timbre) settings for the tax report
ALTER TABLE "company_settings" ADD COLUMN "stamp_duty_enabled" BOOLEAN DEFAULT false;
ALTER TABLE "company_settings" ADD COLUMN "stamp_duty_rate" DOUBLE PRECISION DEFAULT 1.0;
