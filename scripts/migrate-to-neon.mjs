// Copy the production database (public schema) from Supabase to Neon, then
// compare exact row counts table by table.
//
//   node scripts/migrate-to-neon.mjs
//
// Source: DIRECT_URL from .env (Supabase, read only — pg_dump never writes).
// Target: NEON_DIRECT_URL from .env (Neon's non-pooled string; pg_restore
// and DDL do not work through the pooler).
//
// Re-runnable: the restore drops and recreates the public schema on Neon, so
// run it once as a rehearsal and again right before switching Vercel over.
// Connection strings are never printed.
//
// Needs the PostgreSQL 18 client tools (pg_dump must be at least the server's
// major version). Set PG_BIN to override the default Windows install path.

import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PG_BIN = process.env.PG_BIN ?? "C:/Program Files/PostgreSQL/18/bin";

function readEnv(file, key) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`${file} not found`);
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && m[1] === key) {
      const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
      if (value) return value;
    }
  }
  throw new Error(`${key} is missing or empty in ${file}`);
}

function run(tool, args, { capture = false } = {}) {
  const res = spawnSync(join(PG_BIN, tool), args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "pipe"],
  });
  if (res.error) throw res.error;
  return res;
}

function psql(url, sql) {
  const res = run("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-d", url, "-c", sql], { capture: true });
  if (res.status !== 0) throw new Error(`psql failed: ${res.stderr.trim()}`);
  return res.stdout.trim();
}

function tableCounts(url) {
  const tables = psql(
    url,
    "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1"
  )
    .split(/\r?\n/)
    .filter(Boolean);
  if (tables.length === 0) return new Map();
  const sql = tables
    .map((t) => `select '${t}', count(*) from public."${t}"`)
    .join(" union all ");
  return new Map(
    psql(url, sql)
      .split(/\r?\n/)
      .map((l) => l.split("|"))
      .map(([t, c]) => [t, Number(c)])
  );
}

const source = readEnv(".env", "DIRECT_URL");
const target = readEnv(".env", "NEON_DIRECT_URL");
if (!/neon\.tech/.test(target)) throw new Error("NEON_DIRECT_URL does not point at neon.tech");
if (/-pooler\./.test(target)) throw new Error("NEON_DIRECT_URL is the pooled string; use the one with pooling off");

const sourceVersion = psql(source, "show server_version");
const targetVersion = psql(target, "show server_version");
console.log(`Source Postgres ${sourceVersion} -> Neon Postgres ${targetVersion}`);

const dir = mkdtempSync(join(tmpdir(), "probook-neon-"));
const dump = join(dir, "public.dump");
try {
  console.log("Dumping the public schema from Supabase...");
  const d = run("pg_dump", ["-Fc", "-n", "public", "--no-owner", "--no-privileges", "-f", dump, "-d", source]);
  if (d.status !== 0) throw new Error(`pg_dump failed: ${d.stderr.trim()}`);

  console.log("Restoring into Neon (drops and recreates public)...");
  const r = run("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction", "-d", target, dump]);
  if (r.status !== 0) throw new Error(`pg_restore failed: ${r.stderr.trim()}`);

  // Uploaded files moved to R2 (copy-uploads-to-r2.mjs, same keys): point the
  // copied rows at the new public address. Only these two columns hold file
  // URLs (checked across every text/json column on 2026-11-17).
  const oldPrefix = `${readEnv(".env", "NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "")}/storage/v1/object/public/uploads/`;
  const newPrefix = `${readEnv(".env", "R2_PUBLIC_URL").replace(/\/+$/, "")}/`;
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  const rewritten = psql(
    target,
    `with a as (update public.company_settings set logo_path = replace(logo_path, ${q(oldPrefix)}, ${q(newPrefix)}) where logo_path like ${q(oldPrefix + "%")} returning 1),
          b as (update public.products set photo_path = replace(photo_path, ${q(oldPrefix)}, ${q(newPrefix)}) where photo_path like ${q(oldPrefix + "%")} returning 1)
     select (select count(*) from a) || ' logos, ' || (select count(*) from b) || ' product photos'`
  );
  console.log(`File addresses moved to R2: ${rewritten}`);

  console.log("Comparing exact row counts...");
  const [a, b] = [tableCounts(source), tableCounts(target)];
  let mismatches = 0;
  for (const t of new Set([...a.keys(), ...b.keys()])) {
    const ok = a.get(t) === b.get(t);
    if (!ok) mismatches++;
    if (!ok || a.get(t) > 0) {
      console.log(`${ok ? "ok      " : "MISMATCH"} ${t.padEnd(40)} ${a.get(t) ?? "-"} -> ${b.get(t) ?? "-"}`);
    }
  }
  const migrations = psql(target, 'select count(*) from public."_prisma_migrations" where finished_at is not null');
  console.log(`\n${a.size} tables on Supabase, ${b.size} on Neon, ${mismatches} mismatches; ${migrations} Prisma migrations recorded on Neon.`);
  if (mismatches) process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
