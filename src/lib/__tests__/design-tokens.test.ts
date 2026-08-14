import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * A `border-(--color-border)` whose variable is never declared does not fail
 * loudly: CSS drops the declaration and the element falls back to whatever the
 * cascade left behind. That is exactly how nineteen cards spent months drawing
 * a border nobody chose. This test is the noise that bug never made.
 */

const ROOT = join(__dirname, "..", "..");
const GLOBALS = join(ROOT, "app", "globals.css");

const css = readFileSync(GLOBALS, "utf8");

/** Every custom property the stylesheet declares, from any block. */
const declared = new Set(
  Array.from(css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim), (m) => m[1])
);

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

describe("design tokens", () => {
  it("declares every custom property the components consume", () => {
    const missing = new Map<string, string[]>();

    for (const file of sourceFiles(ROOT)) {
      const contents = readFileSync(file, "utf8");
      // Tailwind's arbitrary-value form: text-(--color-text-primary)
      for (const [, name] of contents.matchAll(/\((--[a-z0-9-]+)\)/g)) {
        if (declared.has(name)) continue;
        // Fonts come from next/font at runtime, not from the stylesheet.
        if (name.startsWith("--font-")) continue;
        const users = missing.get(name) ?? [];
        users.push(file.slice(ROOT.length + 1).replace(/\\/g, "/"));
        missing.set(name, users);
      }
    }

    expect(
      Array.from(missing, ([name, users]) => `${name} — used in ${users.join(", ")}`),
      "custom properties used by components but never declared in globals.css"
    ).toEqual([]);
  });

  it("defines the same surface tokens in light and dark", () => {
    const block = (selector: string) => {
      const start = css.indexOf(selector);
      expect(start, `${selector} block`).toBeGreaterThan(-1);
      const open = css.indexOf("{", start);
      const end = css.indexOf("}", open);
      return new Set(
        Array.from(css.slice(open, end).matchAll(/(--[a-z0-9-]+)\s*:/g), (m) => m[1])
      );
    };

    const light = block(":root {");
    const dark = block(".dark {");

    // A token defined in one theme and forgotten in the other renders one
    // theme's text on the other theme's ground.
    expect([...light].filter((t) => !dark.has(t)), "missing from .dark").toEqual([]);
    expect([...dark].filter((t) => !light.has(t)), "missing from :root").toEqual([]);
  });
});
