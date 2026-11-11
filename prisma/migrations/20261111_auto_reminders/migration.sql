-- Payment reminder cadence and automatic sending (src/lib/reminder-sweep.ts).
-- Defaults keep today's behaviour: a first reminder the day after the due
-- date, nothing sent without the user.
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "reminder_steps" TEXT NOT NULL DEFAULT '1,15,30';
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "auto_send_reminders" BOOLEAN NOT NULL DEFAULT false;
