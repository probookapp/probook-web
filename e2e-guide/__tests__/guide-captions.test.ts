import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Narration, against the captions the other two languages read from.
 *
 * `narrate()` throws on a missing line, which is the right behaviour at record
 * time — a French sentence spoken over an English screen is worse than no
 * video. But it throws one line at a time, halfway into a chapter, after a
 * browser has started: translating a chapter meant a dozen record-fail-fix
 * rounds. This is the whole list, in under a second, before anything launches.
 *
 * `e2e-guide/lib/locale.ts` names this test in its error message. Renaming the
 * file means fixing that string too.
 */
import { chapterFiles, chapterNarration } from "../../scripts/guide-narration.mjs";

const ROOT = process.cwd();
const CAPTIONS = path.join(ROOT, "e2e-guide", "captions");

/** The recorded languages, minus the one the chapters are written in. */
const TRANSLATED = ["en", "ar"];

/**
 * Every French line the two guide suites will ask `narrate()` for. The scan
 * itself lives in scripts/guide-narration.mjs, shared with the /guide
 * transcripts, so the two can never disagree about what a chapter says.
 */
function spokenLines(): Map<string, string> {
  const lines = new Map<string, string>();
  for (const file of chapterFiles(ROOT)) {
    const where = path.basename(file);
    for (const call of chapterNarration(file)) {
      for (const literal of call.lines) {
        if (!lines.has(literal)) lines.set(literal, where);
      }
    }
  }
  return lines;
}

function captions(locale: string): Record<string, string> {
  const file = path.join(CAPTIONS, `${locale}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
}

describe("guide captions", () => {
  const spoken = spokenLines();

  it("finds the narration in the chapters", () => {
    // A scanner that silently matched nothing would make every check below
    // pass. The chapters are eleven desktop plus four mobile.
    expect(chapterFiles(ROOT).length).toBeGreaterThanOrEqual(15);
    expect(spoken.size).toBeGreaterThan(200);
  });

  for (const locale of TRANSLATED) {
    it(`${locale} translates every spoken line`, () => {
      const lines = captions(locale);
      const untranslated = [...spoken]
        .filter(([fr]) => !(fr in lines))
        .map(([fr, file]) => `${file}: ${fr}`);

      expect(untranslated, `lines with no ${locale} caption`).toEqual([]);
    });

    it(`${locale} has no caption for a line nobody says`, () => {
      // Editing a French sentence leaves its old translation behind, still
      // looking complete. Dead entries are how a real gap hides in a diff.
      const stale = Object.keys(captions(locale)).filter((fr) => !spoken.has(fr));

      expect(stale, `${locale} captions no chapter asks for`).toEqual([]);
    });

    it(`${locale} leaves no caption empty`, () => {
      const blank = Object.entries(captions(locale))
        .filter(([, line]) => line.trim() === "")
        .map(([fr]) => fr);

      expect(blank).toEqual([]);
    });
  }

  it("the two translated locales cover the same lines", () => {
    const [first, second] = TRANSLATED.map((l) => Object.keys(captions(l)).sort());
    expect(first).toEqual(second);
  });
});
