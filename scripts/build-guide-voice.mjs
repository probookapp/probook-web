#!/usr/bin/env node
/**
 * Synthesize the voice-over of every guide chapter before filming.
 *
 *   npm run guide:voice            French
 *   npm run guide:voice -- en ar   other languages
 *
 * Reads the spoken lines straight from the chapters (scripts/guide-narration.mjs)
 * and their captions, and makes only the clips that are missing — see
 * scripts/guide-voice.mjs for the cache and the providers.
 */
import path from "node:path";
import { chapterFiles, chapterNarration, readCaptions } from "./guide-narration.mjs";
import { synthesizeMissing, voiceName, voiceSettings } from "./guide-voice.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const locales = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const settings = voiceSettings();

if (settings.provider === "off") {
  console.error("No voice provider: set AZURE_SPEECH_KEY (Azure) or GUIDE_VOICE=sapi in .env.test.");
  process.exit(1);
}

const french = [
  ...new Set(
    chapterFiles(ROOT).flatMap((file) =>
      chapterNarration(file)
        .filter((c) => c.kind === "say")
        .map((c) => c.lines[0])
    )
  ),
];

for (const locale of locales.length ? locales : ["fr"]) {
  const captions = locale === "fr" ? null : readCaptions(ROOT, locale);
  const lines = french.map((fr) => (captions ? captions[fr] : fr)).filter(Boolean);
  console.log(`${locale}: ${lines.length} lines, voice ${voiceName(locale, settings) ?? "(silence)"} via ${settings.provider}`);
  const made = await synthesizeMissing(ROOT, locale, lines, settings, process.env, (m) => console.log("  " + m));
  console.log(`${locale}: ${made} made, ${lines.length - made} already cached`);
}
