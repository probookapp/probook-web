#!/usr/bin/env node
/**
 * Write the narration of every guide chapter, in fr/en/ar, to
 * src/content/guide/transcripts.json — the transcript printed under each video
 * on the public /guide pages.
 *
 *   npm run guide:content
 *
 * Run it after editing a chapter's narration or its captions.
 * src/lib/__tests__/guide-content.test.ts fails while the file is out of date,
 * so a transcript cannot quietly describe a take that is no longer filmed.
 */
import fs from "node:fs";
import path from "node:path";
import { buildTranscripts } from "./guide-narration.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "src", "content", "guide", "transcripts.json");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(buildTranscripts(ROOT), null, 2) + "\n", "utf8");
console.log(`wrote ${path.relative(ROOT, OUT)}`);
