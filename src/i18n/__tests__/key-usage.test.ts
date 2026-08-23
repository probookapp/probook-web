import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Keys the code asks for, against keys the bundles define.
 *
 * The other half of locale-parity. That test proves the three locales agree
 * with each other; it cannot see a key that is missing from all of them,
 * because nothing in the JSON is wrong — the mistake is in the call site.
 *
 * The failure is silent by design: i18next returns the key path when it finds
 * nothing, so `t("validation.nameRequired")` puts the literal string
 * "validation.nameRequired" under the name field and the form still submits.
 * It reached production three times before this test existed.
 *
 * Reading the source with regexes rather than the TypeScript AST is a
 * deliberate trade: every binding in this codebase is one of four shapes, and
 * a parse of 400 files on every `vitest run` is not worth the seconds. The
 * shapes are asserted below, so a new one fails here instead of being skipped.
 */
const SRC = path.join(process.cwd(), "src");
const LOCALES = path.join(SRC, "i18n/locales");
const REFERENCE = "fr";

type Json = Record<string, unknown>;

const BUNDLES: Record<string, Json> = Object.fromEntries(
  fs
    .readdirSync(path.join(LOCALES, REFERENCE))
    .filter((f) => f.endsWith(".json"))
    .map((f) => [
      f.replace(/\.json$/, ""),
      JSON.parse(fs.readFileSync(path.join(LOCALES, REFERENCE, f), "utf8")) as Json,
    ])
);

const NAMESPACES = Object.keys(BUNDLES);

/** The namespace a bare key falls back to — i18next's `defaultNS`. */
const DEFAULT_NS = "common";

/** Plural and ordinal forms live under suffixed siblings, not the bare key. */
const SUFFIXES = ["", "_one", "_other", "_zero", "_two", "_few", "_many"];

function nodeAt(ns: string, dotted: string): unknown {
  const bundle = BUNDLES[ns];
  if (!bundle) return undefined;
  return dotted.split(".").reduce<unknown>((acc, part) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Json)[part];
  }, bundle);
}

/** A key resolves when it lands on a string, in any of its plural forms. */
function resolves(ns: string, key: string): boolean {
  return SUFFIXES.some((suffix) => typeof nodeAt(ns, key + suffix) === "string");
}

/** A dynamic key like `status.${x}` resolves when its static parent is a group. */
function groupExists(ns: string, prefix: string): boolean {
  if (!prefix) return Boolean(BUNDLES[ns]);
  const node = nodeAt(ns, prefix);
  return node !== null && typeof node === "object";
}

/**
 * The file with its comments removed.
 *
 * A doc comment that quotes a call — this test's own explanation of
 * `t(`status:${row.state}`)` was the first casualty — is not a call. Strings
 * are walked rather than skipped so that a `//` inside a URL survives.
 */
function stripComments(source: string): string {
  let out = "";
  for (let i = 0; i < source.length; i++) {
    const pair = source.slice(i, i + 2);

    if (pair === "//") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (pair === "/*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    const char = source[i];
    if (char === '"' || char === "'" || char === "`") {
      out += char;
      i++;
      while (i < source.length && source[i] !== char) {
        if (source[i] === "\\") {
          out += source[i];
          i++;
        }
        out += source[i];
        i++;
      }
      out += source[i] ?? "";
      continue;
    }

    out += char;
  }
  return out;
}

const readSource = (file: string) => stripComments(fs.readFileSync(file, "utf8"));

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * What each `t`-shaped identifier in a file is bound to.
 *
 * `null` marks a binding whose namespace is computed (`useTranslation([ns,
 * "common"])`): a bare key through it cannot be checked here, so it is left to
 * the runtime barrier in e2e/responsive-audit.spec.ts.
 */
type Binding = string[] | null;

const DESTRUCTURE = /const\s*\{([^}]*)\}\s*=\s*useTranslation\(([^;]*?)\)\s*;/g;
/** The PDF components build their own `t` over the same bundles. */
const PDF_HELPER = /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*(pdfString|commonString)\(/g;
/** A local wrapper that pins a namespace: `const tc = (k) => t(k, {ns:"common"})`. */
const WRAPPER = /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*t\([^;]*?\bns:\s*["'](\w+)["']/g;

function bindingsIn(source: string): Map<string, Binding> {
  const bindings = new Map<string, Binding>();

  for (const match of source.matchAll(DESTRUCTURE)) {
    const [, destructured, argument] = match;
    // `{ t }`, `{ t: tCommon }`, `{ t, i18n }`, `{ i18n }` — only the
    // translator matters, and a file may pull the hook for its language alone.
    const alias = /\bt\s*:\s*(\w+)/.exec(destructured)?.[1] ?? (/\bt\b/.test(destructured) ? "t" : null);
    if (!alias) continue;

    const trimmed = argument.trim();
    if (trimmed === "") {
      bindings.set(alias, [DEFAULT_NS]);
      continue;
    }
    const literals = [...trimmed.matchAll(/["'`]([a-zA-Z]+)["'`]/g)].map((m) => m[1]);
    // An array with a computed member: `[ns, "common"]`.
    const computed = /\[/.test(trimmed) && literals.length < trimmed.split(",").length;
    bindings.set(alias, computed || literals.length === 0 ? null : literals);
  }

  for (const match of source.matchAll(PDF_HELPER)) {
    bindings.set(match[1], [match[2] === "commonString" ? "common" : "pdf"]);
  }

  for (const match of source.matchAll(WRAPPER)) {
    bindings.set(match[1], [match[2]]);
  }

  return bindings;
}

/** Every `useTranslation(` the scanner could not turn into a binding. */
function unparsedHooks(source: string): number {
  const total = (source.match(/useTranslation\(/g) ?? []).length;
  const parsed =
    [...source.matchAll(DESTRUCTURE)].length +
    // A destructure with no `t` in it is parsed, just not bindable.
    0;
  return Math.max(0, total - parsed);
}

type Call = { alias: string; quote: string; raw: string; after: string };

/**
 * Every call that carries a key, wherever the `t` came from.
 *
 * A template literal is captured up to its first `${`: `common:status.${s}`
 * still proves the namespace and the group it indexes into.
 */
function callsIn(source: string): Call[] {
  const calls: Call[] = [];
  const patterns: Array<[RegExp, "capture" | "i18n"]> = [
    [/(?:^|[^\w.$])(t|tCommon|tc)\(\s*(["'`])((?:[^"'`$\\]|\$(?!\{))*)/g, "capture"],
    [/\b(i18n\.t)\(\s*(["'`])((?:[^"'`$\\]|\$(?!\{))*)/g, "i18n"],
    [/\b(pdfString|commonString)\(\s*(["'`])((?:[^"'`$\\]|\$(?!\{))*)/g, "capture"],
  ];
  for (const [pattern] of patterns) {
    for (const match of source.matchAll(pattern)) {
      const end = (match.index ?? 0) + match[0].length;
      calls.push({
        alias: match[1],
        quote: match[2],
        raw: match[3],
        after: source.slice(end, end + 160),
      });
    }
  }
  return calls;
}

type Violation = { file: string; call: string; reason: string };

function checkFile(file: string, violations: Violation[]) {
  const source = readSource(file);
  if (!/useTranslation|\bt\(|i18n\.t\(|pdfString\(|commonString\(/.test(source)) return;

  const bindings = bindingsIn(source);
  const relative = path.relative(process.cwd(), file).replace(/\\/g, "/");

  for (const { alias, quote, raw, after } of callsIn(source)) {
    if (raw === "") continue;

    // A template whose text was cut at `${` is only partly known.
    const isTemplate = quote === "`" && !after.startsWith(quote);
    const call = `${alias}(${quote}${raw}${isTemplate ? "${…}" : ""}${quote})`;

    let namespaces: Binding;
    let key = raw;

    if (raw.includes(":")) {
      const [ns, rest] = [raw.slice(0, raw.indexOf(":")), raw.slice(raw.indexOf(":") + 1)];
      if (!NAMESPACES.includes(ns)) {
        violations.push({ file: relative, call, reason: `no namespace "${ns}"` });
        continue;
      }
      namespaces = [ns];
      key = rest;
    } else if (isTemplate && raw.startsWith("$")) {
      // `${ns}:lines.count` — the namespace itself is computed.
      continue;
    } else if (alias === "pdfString") {
      namespaces = ["pdf"];
    } else if (alias === "commonString") {
      namespaces = ["common"];
    } else if (alias === "i18n.t") {
      violations.push({ file: relative, call, reason: "i18n.t needs an explicit namespace prefix" });
      continue;
    } else if (bindings.has(alias)) {
      namespaces = bindings.get(alias)!;
    } else {
      // `t` arrives as a parameter — a schema factory, a helper. Nothing here
      // says which namespace the caller bound, and guessing is how
      // "validation.nameRequired" shipped: write the namespace into the key.
      violations.push({
        file: relative,
        call,
        reason: "t is not bound in this file — prefix the key with its namespace",
      });
      continue;
    }

    if (namespaces === null) continue; // computed namespace, unresolvable here

    // An explicit `{ ns: "x" }` option overrides the binding.
    const override = /^["'`]?\s*,\s*\{[^}]*\bns:\s*["'](\w+)["']/.exec(after)?.[1];
    if (override) namespaces = [override];

    if (isTemplate) {
      // Only the text before `${` is known; check the group it indexes into.
      const prefix = key.includes(".") ? key.slice(0, key.lastIndexOf(".")) : "";
      if (!namespaces.some((ns) => groupExists(ns, prefix))) {
        violations.push({
          file: relative,
          call,
          reason: `no group "${prefix}" in ${namespaces.join(" or ")}`,
        });
      }
      continue;
    }

    if (!namespaces.some((ns) => resolves(ns, key))) {
      violations.push({ file: relative, call, reason: `not in ${namespaces.join(" or ")}` });
    }
  }
}

describe("translation keys the code asks for", () => {
  it("recognises every way this codebase gets a t", () => {
    // A shape the scanner cannot parse is a file it silently stops covering —
    // the one failure mode that would make a green run meaningless.
    const unparsed = sourceFiles(SRC)
      .map((f) => [f, unparsedHooks(readSource(f))] as const)
      .filter(([, count]) => count > 0)
      .map(([f]) => path.relative(process.cwd(), f).replace(/\\/g, "/"));

    expect(unparsed, "useTranslation() written in a shape bindingsIn() does not parse").toEqual([]);

    const covered = sourceFiles(SRC).filter((f) => bindingsIn(readSource(f)).size > 0);
    expect(covered.length).toBeGreaterThan(100);
  });

  it("every key exists in the reference locale", () => {
    const violations: Violation[] = [];
    for (const file of sourceFiles(SRC)) checkFile(file, violations);

    expect(
      violations.map((v) => `${v.file}: ${v.call} — ${v.reason}`),
      "keys the UI would print as raw dotted paths"
    ).toEqual([]);
  });
});
