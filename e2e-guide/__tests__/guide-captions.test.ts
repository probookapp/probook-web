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
const GUIDE = path.join(process.cwd(), "e2e-guide");
const MOBILE = path.join(process.cwd(), "e2e-guide-mobile");
const CAPTIONS = path.join(GUIDE, "captions");

/** The recorded languages, minus the one the chapters are written in. */
const TRANSLATED = ["en", "ar"];

/**
 * Chapter calls that carry a French sentence into `narrate()`, and how many of
 * their string arguments it reaches: `say("…", 2600)` narrates one,
 * `titleCard("…", "…")` two, `open(page, "…")` one — `page` is not a literal,
 * so counting literals rather than arguments is enough to tell them apart.
 */
const NARRATING = /\b(say|titleCard|open)\(/g;
const SPOKEN_ARGS: Record<string, number> = { say: 1, titleCard: 2, open: 1 };

/**
 * The top-level string literals in one call, in order.
 *
 * Scanned rather than matched: a caption runs onto its own line and contains
 * apostrophes, colons and parentheses of its own. Literals nested inside
 * another call — `say(t("x"))` — belong to that call, not this one.
 */
function literalsInCall(source: string, openParen: number): string[] {
  const found: string[] = [];
  let depth = 0;

  for (let i = openParen; i < source.length; i++) {
    const char = source[i];

    if (char === '"' || char === "'" || char === "`") {
      let literal = "";
      i++;
      while (i < source.length && source[i] !== char) {
        if (source[i] === "\\") i++;
        literal += source[i];
        i++;
      }
      if (depth === 1) found.push(literal);
      continue;
    }

    if (char === "(") depth++;
    else if (char === ")") {
      depth--;
      if (depth === 0) break;
    }
  }

  return found;
}

function chapterFiles(): string[] {
  return [GUIDE, MOBILE].flatMap((dir) =>
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".spec.ts"))
      .map((f) => path.join(dir, f))
  );
}

/** Every French line the two guide suites will ask `narrate()` for. */
function spokenLines(): Map<string, string> {
  const lines = new Map<string, string>();
  for (const file of chapterFiles()) {
    const source = fs.readFileSync(file, "utf8");
    const where = path.basename(file);
    for (const match of source.matchAll(NARRATING)) {
      const open = (match.index ?? 0) + match[0].length - 1;
      const spoken = literalsInCall(source, open).slice(0, SPOKEN_ARGS[match[1]]);
      for (const literal of spoken) {
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
    expect(chapterFiles().length).toBeGreaterThanOrEqual(15);
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
