#!/usr/bin/env node
/**
 * Send the guide's images to the R2 bucket that serves files.probookapp.net.
 *
 *   npm run guide:upload
 *
 * Reads the production R2 settings from .env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL) — the same bucket as the
 * uploaded logos, under guide/. Uploads only what the manifest names and the
 * bucket does not have yet: images are named after their content, so an
 * existing name is an identical image. Nothing is ever deleted from the bucket.
 */
import fs from "node:fs";
import path from "node:path";
import { AwsClient } from "aws4fetch";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMAGES = path.join(ROOT, "guide-output", "guide-images");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "content", "guide", "screens.json"), "utf8"));

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
  console.error("Missing R2_* settings: run through `npm run guide:upload`, which reads them from .env.");
  process.exit(1);
}

const client = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
});
const objectUrl = (name) => `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/guide/${name}`;

const names = new Set();
for (const byLocale of Object.values(manifest)) {
  for (const list of Object.values(byLocale)) {
    for (const step of list) if (step) names.add(step.k);
  }
}

let sent = 0;
let present = 0;
for (const name of names) {
  const head = await client.fetch(objectUrl(name), { method: "HEAD" });
  if (head.ok) {
    present++;
    continue;
  }
  const file = path.join(IMAGES, name);
  if (!fs.existsSync(file)) {
    console.error(`${name} is in the manifest but not in ${path.relative(ROOT, IMAGES)} — run \`npm run guide:images\`.`);
    process.exitCode = 1;
    continue;
  }
  const res = await client.fetch(objectUrl(name), {
    method: "PUT",
    body: fs.readFileSync(file),
    headers: {
      "Content-Type": "image/webp",
      // Named after their content: never stale, so cached for good.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  if (!res.ok) {
    console.error(`${name}: upload failed (${res.status})`);
    process.exitCode = 1;
    continue;
  }
  sent++;
}
console.log(`${sent} uploaded, ${present} already there, ${names.size} in the guide (${R2_PUBLIC_URL}/guide/)`);
