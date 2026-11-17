// Copy every file in Supabase Storage (bucket "uploads") to the R2 bucket,
// under the same key, then check each one is served by R2_PUBLIC_URL.
//
//   node scripts/copy-uploads-to-r2.mjs
//
// Source: the public Supabase URL (NEXT_PUBLIC_SUPABASE_URL in .env) and the
// object list from storage.objects (DIRECT_URL in .env, read only).
// Target: R2_* credentials and public URL, also from .env.
//
// Only real images are copied (PNG, JPEG, GIF, WebP, recognised by their
// bytes): the old upload routes accepted anything, and files.probookapp.net is
// our own domain. Anything else is listed and skipped.
//
// Idempotent: re-run it at cut-over to pick up files uploaded since.
// The database addresses are rewritten by migrate-to-neon.mjs.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { AwsClient } from "aws4fetch";

const PG_BIN = process.env.PG_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
const SOURCE_BUCKET = "uploads";

function readEnv(file, key) {
  const text = readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && m[1] === key) {
      const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
      if (value) return value;
    }
  }
  throw new Error(`${key} is missing or empty in ${file}`);
}

function detectImage(b) {
  const starts = (sig, at = 0) => sig.every((x, i) => b[at + i] === x);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

const supabaseUrl = readEnv(".env", "NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const sourceDb = readEnv(".env", "DIRECT_URL");
const accountId = readEnv(".env", "R2_ACCOUNT_ID");
const bucket = readEnv(".env", "R2_BUCKET");
const publicUrl = readEnv(".env", "R2_PUBLIC_URL").replace(/\/+$/, "");
const r2 = new AwsClient({
  accessKeyId: readEnv(".env", "R2_ACCESS_KEY_ID"),
  secretAccessKey: readEnv(".env", "R2_SECRET_ACCESS_KEY"),
  service: "s3",
  region: "auto",
});

const list = spawnSync(
  join(PG_BIN, "psql"),
  ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-d", sourceDb, "-c",
    `select name from storage.objects where bucket_id = '${SOURCE_BUCKET}' order by name`],
  { encoding: "utf8" }
);
if (list.status !== 0) throw new Error(`Listing storage.objects failed: ${list.stderr.trim()}`);
const keys = list.stdout.split(/\r?\n/).filter(Boolean);
console.log(`${keys.length} files in Supabase bucket "${SOURCE_BUCKET}"`);

const enc = (key) => key.split("/").map(encodeURIComponent).join("/");
let copied = 0;
const skipped = [];
const failed = [];

for (const key of keys) {
  try {
    const src = await fetch(`${supabaseUrl}/storage/v1/object/public/${SOURCE_BUCKET}/${enc(key)}`);
    if (!src.ok) throw new Error(`download ${src.status}`);
    const body = new Uint8Array(await src.arrayBuffer());
    const type = detectImage(body);
    if (!type) {
      skipped.push(`${key} (${src.headers.get("content-type")}, ${body.byteLength} bytes)`);
      continue;
    }
    const put = await r2.fetch(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${enc(key)}`, {
      method: "PUT",
      body,
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" },
    });
    if (!put.ok) throw new Error(`upload ${put.status} ${await put.text()}`);
    const check = await fetch(`${publicUrl}/${enc(key)}?v=copy-check-${Date.now()}`, { method: "HEAD" });
    if (!check.ok) throw new Error(`public check ${check.status}`);
    copied++;
  } catch (err) {
    failed.push(`${key}: ${err.message}`);
  }
}

console.log(`Copied and verified: ${copied}`);
if (skipped.length) console.log(`Skipped (not an image):\n  ${skipped.join("\n  ")}`);
if (failed.length) {
  console.log(`FAILED:\n  ${failed.join("\n  ")}`);
  process.exitCode = 1;
}
