#!/usr/bin/env node
/**
 * Turn the guide's raw screenshots into the images the /guide pages show.
 *
 *   npm run guide:shots          capture (per language: guide:shots:en, :ar…)
 *   npm run guide:images         this script: every language captured
 *   npm run guide:images -- fr   one language
 *   npm run guide:upload         send new images to the R2 bucket
 *
 * Each step's PNG (guide-output/shots/<locale>/<suite>/<chapter>/NN.png) is
 * resized and encoded as WebP, named after a hash of its bytes, and written to
 * guide-output/guide-images/. Same picture, same name: an image that did not
 * change between two runs is not uploaded again, and a changed one gets a new
 * URL, so no cache ever serves an old screen.
 *
 * src/content/guide/screens.json maps each chapter's sentences, per language,
 * to those names — null where a step shows nothing new (the same screen as the
 * step before) or was not taken (a step the chapter skipped, like opening a
 * till that was already open). Pictures are matched to sentences by text: the
 * chapter records the source sentence of every screenshot (steps.json), and a
 * sentence the transcript does not have means the transcript is stale — that
 * stops the script.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(import.meta.dirname, "..");
const SHOTS = path.join(ROOT, "guide-output", "shots");
const OUT = path.join(ROOT, "guide-output", "guide-images");
const MANIFEST = path.join(ROOT, "src", "content", "guide", "screens.json");
const TRANSCRIPTS = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "content", "guide", "transcripts.json"), "utf8"));

/** Twice the width the guide's column shows them at: sharp on a dense screen. */
const MAX_WIDTH = 1600;

const sha = (buf, n = 16) => crypto.createHash("sha1").update(buf).digest("hex").slice(0, n);
const dirs = (p) => (fs.existsSync(p) ? fs.readdirSync(p).filter((f) => fs.statSync(path.join(p, f)).isDirectory()) : []);

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const locales = wanted.length ? wanted : dirs(SHOTS);
if (!locales.length) {
  console.error("No screenshots in guide-output/shots — run `npm run guide:shots` first.");
  process.exit(1);
}

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
fs.mkdirSync(OUT, { recursive: true });

let made = 0;
let failed = false;
for (const locale of locales) {
  for (const suite of dirs(path.join(SHOTS, locale))) {
    for (const chapter of dirs(path.join(SHOTS, locale, suite))) {
      const dir = path.join(SHOTS, locale, suite, chapter);
      const source = `${suite}/${chapter}`;
      const stepsFile = path.join(dir, "steps.json");
      if (!fs.existsSync(stepsFile)) {
        console.error(`${locale} ${source}: no steps.json — the chapter did not finish.`);
        failed = true;
        continue;
      }
      const { said } = JSON.parse(fs.readFileSync(stepsFile, "utf8"));
      const sentences = TRANSCRIPTS[source]?.fr;
      if (!sentences || !Array.isArray(said)) {
        console.error(`${locale} ${source}: no transcript, or steps.json from an older run — capture again.`);
        failed = true;
        continue;
      }

      // Screenshot n belongs to the transcript sentence equal to said[n],
      // looked for after the previous match so a repeated sentence keeps its
      // place.
      const list = new Array(sentences.length).fill(null);
      let from = 0;
      let previous = null;
      let stale = null;
      for (let n = 0; n < said.length; n++) {
        const i = sentences.indexOf(said[n], from);
        if (i < 0) {
          stale = said[n];
          break;
        }
        from = i + 1;
        const png = path.join(dir, `${String(n).padStart(2, "0")}.png`);
        if (!fs.existsSync(png)) continue;
        const raw = fs.readFileSync(png);
        // A step that leaves the screen as it was shows nothing new.
        const rawHash = sha(raw);
        if (rawHash === previous) continue;
        previous = rawHash;
        const image = sharp(raw);
        const { width } = await image.metadata();
        const webp = await image
          .resize({ width: Math.min(MAX_WIDTH, width), withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer({ resolveWithObject: true });
        const name = `${sha(webp.data)}.webp`;
        const file = path.join(OUT, name);
        if (!fs.existsSync(file)) {
          fs.writeFileSync(file, webp.data);
          made++;
        }
        list[i] = { k: name, w: webp.info.width, h: webp.info.height };
      }
      if (stale) {
        console.error(
          `${locale} ${source}: the chapter said ${JSON.stringify(stale.slice(0, 60))}, which its transcript ` +
            "does not have. Run `npm run guide:content`, then capture again."
        );
        failed = true;
        continue;
      }
      manifest[source] = { ...(manifest[source] ?? {}), [locale]: list };
      console.log(`${locale} ${source}: ${list.filter(Boolean).length}/${sentences.length} sentences with a picture`);
    }
  }
}

// Chapters that no longer exist leave no entry behind.
for (const source of Object.keys(manifest)) {
  if (!TRANSCRIPTS[source]) delete manifest[source];
}
const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 1) + "\n", "utf8");
console.log(`${made} new image(s) in ${path.relative(ROOT, OUT)}; manifest ${path.relative(ROOT, MANIFEST)}`);
if (failed) process.exit(1);
