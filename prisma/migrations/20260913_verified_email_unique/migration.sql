-- One account may hold a given verified email, enforced by the database.
--
-- The application already refused a second one (isEmailTakenByVerifiedUser),
-- but between its SELECT and its INSERT there is a window: two signups in the
-- same second both read "free" and both write. The email is the identity signal
-- behind the subscribe gate and password reset, so two accounts claiming it is
-- not a cosmetic problem.
--
-- Partial, and on lower(email), for two reasons that matter:
--   * WHERE email_verified — an unverified typo must not reserve an address
--     forever. Someone who mistypes at signup has to be able to use the real
--     one, and the person who actually owns it must not be locked out.
--   * lower(email) — the application compares case-insensitively, so an index
--     on the raw column would accept Bob@x.com beside bob@x.com and leave the
--     database disagreeing with the code about what "taken" means.
--
-- Prisma's schema language cannot express an expression index, so this lives in
-- SQL only. See the note on the User model.
CREATE UNIQUE INDEX IF NOT EXISTS "users_verified_email_unique"
  ON "users" (lower("email"))
  WHERE "email_verified" AND "email" IS NOT NULL;
