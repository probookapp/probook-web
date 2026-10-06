import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Translation parity.
 *
 * A missing key doesn't crash: react-i18next falls back to printing the key
 * itself, so the user sees "reports:pipeline.awaitingInvoice" in the middle of
 * a page. That is the failure mode this guards — silent, and only visible to
 * whoever happens to be using that language.
 */
const ROOT = path.join(process.cwd(), "src/i18n/locales");
const REFERENCE = "fr"; // the product's first language
const LOCALES = fs.readdirSync(ROOT).filter((d) => fs.statSync(path.join(ROOT, d)).isDirectory());

type Json = Record<string, unknown>;

function load(locale: string, file: string): Json {
  return JSON.parse(fs.readFileSync(path.join(ROOT, locale, file), "utf8")) as Json;
}

/** Every leaf path in a namespace, e.g. "lines.quantity". */
function leaves(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return [prefix];
  return Object.entries(obj as Json).flatMap(([key, value]) =>
    leaves(value, prefix ? `${prefix}.${key}` : key)
  );
}

/** Interpolation placeholders, e.g. {{count}}. */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort();
}

function valueAt(obj: Json, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Json)[key];
  }, obj);
}

const FILES = fs.readdirSync(path.join(ROOT, REFERENCE)).filter((f) => f.endsWith(".json"));

/**
 * Plural forms French and English never use but Arabic does: 0, 2, 3–10 and
 * 11–99 each have their own. When one is missing, i18next does not settle for
 * the locale's own _other — it jumps to the fallback language, and an Arabic
 * page reads "2 months free" in English.
 */
const EXTRA_PLURAL = /^(.*)_(zero|two|few|many)$/;

/** The reference key an extra plural form stands in for, if it is one. */
function pluralBase(key: string, reference: Set<string>): string | null {
  const match = EXTRA_PLURAL.exec(key);
  return match && reference.has(`${match[1]}_other`) ? `${match[1]}_other` : null;
}

describe("locale files", () => {
  it("has more than one locale to compare", () => {
    expect(LOCALES.length).toBeGreaterThan(1);
    expect(LOCALES).toContain(REFERENCE);
  });

  for (const locale of LOCALES) {
    if (locale === REFERENCE) continue;

    it(`${locale} has the same namespaces as ${REFERENCE}`, () => {
      const present = fs.readdirSync(path.join(ROOT, locale)).filter((f) => f.endsWith(".json"));
      expect(present.sort()).toEqual(FILES.sort());
    });

    it(`${locale} has no missing or extra keys`, () => {
      const missing: string[] = [];
      const extra: string[] = [];

      for (const file of FILES) {
        const reference = new Set(leaves(load(REFERENCE, file)));
        const translated = new Set(leaves(load(locale, file)));
        for (const key of reference) if (!translated.has(key)) missing.push(`${file}:${key}`);
        for (const key of translated) {
          if (!reference.has(key) && !pluralBase(key, reference)) extra.push(`${file}:${key}`);
        }
      }

      // Missing keys print as raw key paths in the UI; extra keys are dead
      // weight that hides the missing ones.
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it(`${locale} keeps the same interpolation placeholders`, () => {
      const unknown: string[] = [];
      const dropped: string[] = [];

      for (const file of FILES) {
        const reference = load(REFERENCE, file);
        const translated = load(locale, file);
        const referenceKeys = new Set(leaves(reference));
        // Extra plural forms are held to the placeholders of the _other they
        // stand in for.
        const pairs = leaves(translated).flatMap((key): [string, string][] => {
          const source = referenceKeys.has(key) ? key : pluralBase(key, referenceKeys);
          return source ? [[source, key]] : [];
        });
        for (const [source, key] of pairs) {
          const from = valueAt(reference, source);
          const to = valueAt(translated, key);
          if (typeof from !== "string" || typeof to !== "string") continue;
          const expected = new Set(placeholders(from));
          const actual = new Set(placeholders(to));

          for (const name of actual) {
            // A placeholder nothing feeds renders as a literal {{name}}.
            if (!expected.has(name)) unknown.push(`${file}:${key} → {{${name}}}`);
          }
          for (const name of expected) {
            if (actual.has(name)) continue;
            // Dropping {{count}} from a singular form is a translation choice,
            // not a defect: "مصروف واحد" reads better than "1 مصروف", and the
            // count is known to be one. Any other omission leaves a hole.
            // The same holds for the Arabic dual, which names the two.
            const singular = /_(one|zero|two)$/.test(key);
            if (name === "count" && singular) continue;
            dropped.push(`${file}:${key} ✗ {{${name}}}`);
          }
        }
      }

      expect({ unknown, dropped }).toEqual({ unknown: [], dropped: [] });
    });
  }

  it("gives every Arabic plural all the forms Arabic counts with", () => {
    // Read from the runtime rather than listed by hand: these are the forms
    // i18next will ask for, and a missing one falls through to English.
    const forms = new Intl.PluralRules("ar").resolvedOptions().pluralCategories;
    const missing: string[] = [];
    for (const file of FILES) {
      const reference = leaves(load(REFERENCE, file));
      const arabic = new Set(leaves(load("ar", file)));
      for (const key of reference) {
        if (!key.endsWith("_other")) continue;
        const base = key.slice(0, -"_other".length);
        for (const form of forms) {
          if (!arabic.has(`${base}_${form}`)) missing.push(`${file}:${base}_${form}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("has no empty translations", () => {
    const empty: string[] = [];
    for (const locale of LOCALES) {
      for (const file of FILES) {
        const data = load(locale, file);
        for (const key of leaves(data)) {
          const value = valueAt(data, key);
          if (typeof value === "string" && value.trim() === "") empty.push(`${locale}/${file}:${key}`);
        }
      }
    }
    expect(empty).toEqual([]);
  });
});
