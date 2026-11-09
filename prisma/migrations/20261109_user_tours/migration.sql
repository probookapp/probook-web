-- Guided tours: which tours each person has finished or dismissed for good
-- (see src/lib/tours.ts).

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tours_completed" JSONB;

-- Everyone who already has an account knows the application: the tours are
-- for people who sign up or are added from now on. Existing users can still
-- replay them from the help button.
UPDATE "users" SET "tours_completed" = '["office","pos","checklist"]'::jsonb;
