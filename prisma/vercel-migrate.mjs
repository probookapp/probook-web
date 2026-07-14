// Applies pending Prisma migrations during Vercel builds — production only.
//
// Preview and production share the same database (DATABASE_URL/DIRECT_URL are set
// for both), so we deliberately skip migrations on preview/other builds to avoid
// applying un-merged migrations to the production database. Only a build for the
// production environment (i.e. a push to the production branch) runs them.
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV ?? "unset";

if (env === "production") {
  console.log("[vercel-migrate] Production build — applying database migrations…");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log(`[vercel-migrate] Skipping migrations (VERCEL_ENV=${env}).`);
}
