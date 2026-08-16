import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Two ways a table quietly stops being readable.
 *
 * The first is alignment. `text-right` and `text-end` are the same thing in
 * French and opposites in Arabic, and the application ships in both. A column
 * of money set with `text-right` lands on the wrong side of its own heading as
 * soon as the page flips, and nothing fails — it just looks wrong to the half
 * of the customers who read that way.
 *
 * The second is worse because it happens in the language it was written in.
 * Writing both classes on one element reads like an override; it is not. They
 * set the same property, so the winner is whichever Tailwind emitted last, not
 * whichever was typed last. Twenty-six of those had accumulated.
 *
 * Numbers themselves are covered by NUMERIC_CELL in components/ui/Table.tsx.
 */

const SOURCE_ROOT = join(process.cwd(), "src");

/**
 * Generated Prisma output is not ours to style, and the stylesheet has to be
 * able to name the utilities it defines.
 */
const SKIP = [
  join("src", "generated"),
  join("src", "app", "globals.css"),
  // This file has to be able to name the classes it forbids.
  "table-standard.test.ts",
];

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (SKIP.some((s) => path.includes(s))) continue;
    if (statSync(path).isDirectory()) {
      sources(path, found);
    } else if (path.endsWith(".tsx") || path.endsWith(".ts")) {
      found.push(path);
    }
  }
  return found;
}

describe("table and figure standards", () => {
  const files = sources(SOURCE_ROOT);

  it("finds sources to check", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("aligns text logically, so Arabic reads the right way round", () => {
    const offenders = files
      .map((path) => {
        const text = readFileSync(path, "utf8");
        const lines = text.split(/\r?\n/);
        const hits = lines
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => /\btext-(right|left)\b/.test(line))
          .map(({ n, line }) => `${path.replace(process.cwd(), "")}:${n}  ${line.trim().slice(0, 90)}`);
        return hits;
      })
      .flat();

    expect(
      offenders,
      "Use text-end / text-start. text-right and text-left are the same thing " +
        "in French and opposites in Arabic:\n" + offenders.join("\n")
    ).toEqual([]);
  });

  it("never sets two alignments on one element", () => {
    const contradictions = files
      .map((path) => {
        const text = readFileSync(path, "utf8");
        return text
          .split(/\r?\n/)
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => /\btext-(end|start)\b[^"'`]*\btext-(end|start)\b/.test(line))
          .filter(({ line }) => {
            // Two different alignments on one element, not the same one twice
            // across separate attributes.
            const found = line.match(/\btext-(end|start)\b/g) ?? [];
            return new Set(found).size > 1;
          })
          .map(({ n, line }) => `${path.replace(process.cwd(), "")}:${n}  ${line.trim().slice(0, 90)}`);
      })
      .flat();

    expect(
      contradictions,
      "Both classes set text-align, so the one that wins is whichever Tailwind " +
        "emitted last — not the one written last:\n" + contradictions.join("\n")
    ).toEqual([]);
  });
});
