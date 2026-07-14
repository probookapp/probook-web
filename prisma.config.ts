import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations must use a direct connection, not Supabase's pgBouncer pool
    // (transaction pooling can't run DDL). Falls back to DATABASE_URL for
    // environments that only define one URL (e.g. local/test).
    url: process.env.DIRECT_URL || process.env.DATABASE_URL!,
  },
});
