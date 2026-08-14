#!/usr/bin/env node
/**
 * Turn the raw Playwright recordings into deliverable videos.
 *
 * Playwright writes one .webm per test under guide-output/raw/<test-dir>/.
 * This script transcodes each to H.264 MP4 (one file per chapter) and then
 * stitches them, in chapter order, into a single full-length cut. The chapter
 * title cards recorded at the start of each spec double as the separators.
 *
 *   node scripts/build-guide-videos.mjs
 *   node scripts/build-guide-videos.mjs --mobile
 *
 * The phone guide is a separate set: its own recordings, its own chapter names
 * and a portrait frame. Requires ffmpeg on PATH.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MOBILE = process.argv.includes("--mobile");

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * One tree per language, matching where the Playwright configs record. Building
 * English on top of French would overwrite it in place, and nothing would say
 * so — the files keep their names, only their contents change.
 */
const LOCALE = (process.env.GUIDE_LOCALE || "fr").toLowerCase();
const OUT = path.join(ROOT, "guide-output", LOCALE);

const RAW = path.join(OUT, MOBILE ? "mobile-raw" : "raw");
const CHAPTERS = path.join(OUT, MOBILE ? "chapitres-mobile" : "chapitres");
const FULL = path.join(
  OUT,
  MOBILE ? `probook-guide-mobile-${LOCALE}.mp4` : `probook-guide-complet-${LOCALE}.mp4`
);

if (!fs.existsSync(RAW)) {
  console.error(
    `No recordings at ${path.relative(ROOT, RAW)}.
` +
      `Record that language first:  npm run guide:${MOBILE ? "mobile:" : ""}record:${LOCALE}`
  );
  process.exit(1);
}

/**
 * The output frame. Portrait for the phone guide — 9:19.5, the shape a prospect
 * watches on WhatsApp or Instagram — landscape 1080p for the desktop one.
 */
const FRAME = MOBILE ? { w: 780, h: 1688 } : { w: 1920, h: 1080 };

/** Human-readable file names, keyed by the chapter number in the spec name. */
const DESKTOP_TITLES = {
  "01": "01-demarrage-creer-son-compte",
  "02": "02-clients",
  "03": "03-produits-et-catalogue",
  "04": "04-devis",
  "05": "05-factures-et-paiements",
  "06": "06-caisse-point-de-vente",
  "07": "07-fournisseurs-et-achats",
  "08": "08-stock-multi-sites",
  "09": "09-livraisons-et-depenses",
  "10": "10-rapports",
  "11": "11-parametres",
};

const MOBILE_TITLES = {
  "01": "mobile-01-devis-sur-le-terrain",
  "02": "mobile-02-encaisser",
  "03": "mobile-03-comptoir",
  "04": "mobile-04-pilotage",
};

const TITLES = MOBILE ? MOBILE_TITLES : DESKTOP_TITLES;

/**
 * Playwright renders the page at the VIEWPORT size and pads the rest of the
 * video frame. If a recording was made while the two differed, the usable image
 * sits in the top-left corner with dead space around it. `GUIDE_CROP=1280:720`
 * cuts it back out — a straight crop, so the pixels are the ones the browser
 * drew, with no rescaling. Leave unset for recordings whose viewport and video
 * size already match.
 */
const CROP = process.env.GUIDE_CROP;
if (CROP && !/^\d+:\d+$/.test(CROP)) {
  console.error(`GUIDE_CROP must look like "1280:720", got "${CROP}"`);
  process.exit(1);
}
const [CROP_W, CROP_H] = CROP ? CROP.split(":") : [];

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  });
}

if (!fs.existsSync(RAW)) {
  console.error(
    `No recordings in ${RAW}.\n` +
      `Record them first: npx playwright test --config=playwright.guide${
        MOBILE ? "-mobile" : ""
      }.config.ts`
  );
  process.exit(1);
}

// Collect one video per chapter. Playwright names the directory after the spec
// file and the test title, so the leading digits give us the running order.
const takes = [];
for (const dir of fs.readdirSync(RAW)) {
  const video = path.join(RAW, dir, "video.webm");
  if (!fs.existsSync(video)) continue;
  const match = /^(\d{2})-/.exec(dir);
  if (!match) {
    console.warn(`skipping ${dir}: no chapter number in the directory name`);
    continue;
  }
  takes.push({ number: match[1], dir, video });
}

if (takes.length === 0) {
  console.error(`No video.webm found under ${RAW}.`);
  process.exit(1);
}

takes.sort((a, b) => a.number.localeCompare(b.number));

// A chapter re-recorded in the same run would appear twice; keep the last take.
const byChapter = new Map();
for (const take of takes) byChapter.set(take.number, take);
const ordered = [...byChapter.values()].sort((a, b) => a.number.localeCompare(b.number));

fs.rmSync(CHAPTERS, { recursive: true, force: true });
fs.mkdirSync(CHAPTERS, { recursive: true });

const produced = [];
for (const take of ordered) {
  const name = `${TITLES[take.number] ?? take.dir}.mp4`;
  const out = path.join(CHAPTERS, name);
  console.log(`→ ${name}`);
  ffmpeg([
    "-i",
    take.video,
    // Constant frame rate and yuv420p: Playwright's VP8 output has a variable
    // frame rate that most editors and social platforms mishandle.
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    CROP
      ? `crop=${CROP_W}:${CROP_H}:0:0`
      : `scale=${FRAME.w}:${FRAME.h}:force_original_aspect_ratio=decrease,` +
        `pad=${FRAME.w}:${FRAME.h}:(ow-iw)/2:(oh-ih)/2`,
    "-movflags",
    "+faststart",
    "-an",
    out,
  ]);
  produced.push(out);
}

// Same codec and resolution throughout, so the full cut is a stream copy.
const listFile = path.join(CHAPTERS, "concat.txt");
fs.writeFileSync(
  listFile,
  produced.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n") + "\n",
  "utf8"
);
console.log("→ probook-guide-complet.mp4");
ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", FULL]);
fs.rmSync(listFile);

const mb = (f) => (fs.statSync(f).size / 1024 / 1024).toFixed(1);
console.log(`\n${produced.length} chapitres dans ${CHAPTERS}`);
for (const f of produced) console.log(`  ${path.basename(f)}  ${mb(f)} Mo`);
console.log(`\nVidéo complète : ${FULL}  ${mb(FULL)} Mo`);
