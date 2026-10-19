/**
 * The narration the guide chapters speak, read straight from their source.
 *
 * Two consumers need the same list: the captions barrier
 * (e2e-guide/__tests__/guide-captions.test.ts), which checks every French line
 * has an English and an Arabic caption, and the public /guide pages, which print
 * each chapter's narration as its transcript. Reading it twice, two ways, is how
 * a transcript ends up describing a take that was never filmed.
 *
 * Plain .mjs with no dependencies so a Node script and vitest can both load it.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Chapter calls that carry a French sentence into `narrate()`, and how many of
 * their string arguments it reaches: `say("…", 2600)` narrates one,
 * `titleCard("…", "…")` two, `open(page, "…")` one — `page` is not a literal,
 * so counting literals rather than arguments is enough to tell them apart.
 */
const NARRATING = /\b(say|titleCard|open)\(/g;
const SPOKEN_ARGS = { say: 1, titleCard: 2, open: 1 };

/**
 * The top-level string literals in one call, in order.
 *
 * Scanned rather than matched: a caption runs onto its own line and contains
 * apostrophes, colons and parentheses of its own. Literals nested inside
 * another call — `say(t("x"))` — belong to that call, not this one.
 */
function literalsInCall(source, openParen) {
  const found = [];
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

/**
 * Every narrating call in one chapter, in the order it is spoken.
 * @returns {{ kind: "say" | "titleCard" | "open", lines: string[] }[]}
 */
export function chapterNarration(file) {
  const source = fs.readFileSync(file, "utf8");
  const calls = [];
  for (const match of source.matchAll(NARRATING)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    const lines = literalsInCall(source, open).slice(0, SPOKEN_ARGS[match[1]]);
    if (lines.length > 0) calls.push({ kind: match[1], lines });
  }
  return calls;
}

/** The chapter files of both suites, desktop first, each in running order. */
export function chapterFiles(root) {
  return ["e2e-guide", "e2e-guide-mobile"].flatMap((dir) =>
    fs
      .readdirSync(path.join(root, dir))
      .filter((f) => f.endsWith(".spec.ts"))
      .sort()
      .map((f) => path.join(root, dir, f))
  );
}

export function readCaptions(root, locale) {
  const file = path.join(root, "e2e-guide", "captions", `${locale}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * What the /guide pages print: per chapter, the spoken sentences (`say`) in
 * each language. Title cards and the chapter label are left out — the page has
 * its own heading — so the transcript reads as the narration alone.
 *
 * Keyed by suite and file name ("desktop/04-devis", "mobile/01-devis-terrain"),
 * which is what src/lib/guide.ts refers to.
 */
export function buildTranscripts(root) {
  const captions = { en: readCaptions(root, "en"), ar: readCaptions(root, "ar") };
  const out = {};
  for (const file of chapterFiles(root)) {
    const suite = path.basename(path.dirname(file)) === "e2e-guide" ? "desktop" : "mobile";
    const id = `${suite}/${path.basename(file, ".spec.ts")}`;
    const fr = chapterNarration(file)
      .filter((c) => c.kind === "say")
      .map((c) => c.lines[0]);
    // A missing caption is the captions barrier's to report; here it would only
    // print French inside an English page, so it falls back to nothing.
    out[id] = {
      fr,
      en: fr.map((line) => captions.en[line] ?? ""),
      ar: fr.map((line) => captions.ar[line] ?? ""),
    };
  }
  return out;
}
