import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GUIDE_FEATURES, GUIDE_TOPICS, MOBILE_TOPICS } from "../../../e2e-guide/feature-inventory";

/**
 * The guide has to cover the product.
 *
 * The chapters in e2e-guide are both the recorded user guide and the end-to-end
 * interface suite, so a page with no chapter is a page nobody watches and nobody
 * exercises. This test fails when the application grows a page that the
 * inventory does not claim — the only way to notice, since nothing else breaks.
 */
const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src/app/[locale]/(app)");
const GUIDE_DIR = path.join(ROOT, "e2e-guide");

/**
 * Every signed-in page route, relative to the locale prefix.
 *
 * The till sits outside the (app) group because it has its own full-screen
 * layout, so it is collected separately rather than being quietly missed.
 */
function appRoutes(): string[] {
  const routes: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      const route = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (fs.existsSync(path.join(child, "page.tsx"))) routes.push(route);
      walk(child, route);
    }
  };
  walk(APP_DIR, "");
  if (fs.existsSync(path.join(ROOT, "src/app/[locale]/pos/page.tsx"))) routes.push("pos");
  return routes.sort();
}

const chapterFiles = fs
  .readdirSync(GUIDE_DIR)
  .filter((f) => /^\d\d-.*\.spec\.ts$/.test(f))
  .map((f) => f.replace(/\.spec\.ts$/, ""))
  .sort();

const sourceOf = (chapter: string) =>
  fs.readFileSync(path.join(GUIDE_DIR, `${chapter}.spec.ts`), "utf8");

describe("every page is claimed by the inventory", () => {
  it("leaves no route unaccounted for", () => {
    const claimed = new Set(GUIDE_FEATURES.map((f) => f.route));
    const missing = appRoutes().filter((r) => !claimed.has(r));
    // A new page must be added to e2e-guide/feature-inventory.ts, and filmed.
    expect(missing).toEqual([]);
  });

  it("claims no route that does not exist", () => {
    const real = new Set(appRoutes());
    const stale = GUIDE_FEATURES.filter((f) => !real.has(f.route)).map((f) => f.route);
    expect(stale).toEqual([]);
  });

  it("points every feature at a chapter that exists", () => {
    const known = new Set(chapterFiles);
    const broken = GUIDE_FEATURES.filter((f) => f.chapter !== null && !known.has(f.chapter)).map(
      (f) => `${f.route} → ${f.chapter}`
    );
    expect(broken).toEqual([]);
  });

  it("explains anything deliberately left unfilmed", () => {
    const unexplained = GUIDE_FEATURES.filter((f) => f.chapter === null && !f.reason).map(
      (f) => f.route
    );
    expect(unexplained).toEqual([]);
  });

  it("has no orphan chapter", () => {
    // A chapter nothing points at is a chapter whose subject nobody declared.
    const used = new Set(GUIDE_FEATURES.map((f) => f.chapter).filter(Boolean));
    for (const topic of GUIDE_TOPICS) used.add(topic.chapter);
    expect(chapterFiles.filter((c) => !used.has(c))).toEqual([]);
  });
});

describe("every declared topic is actually in its chapter", () => {
  it("finds the evidence each topic claims", () => {
    // Naming a chapter is not enough: the chapter has to contain the step, or
    // the inventory would drift into wishful thinking.
    const unproven = GUIDE_TOPICS.filter(
      (topic) => !sourceOf(topic.chapter).includes(topic.evidence)
    ).map((topic) => `${topic.label} (${topic.chapter}: "${topic.evidence}")`);
    expect(unproven).toEqual([]);
  });
});

describe("every claimed page is actually visited", () => {
  it("finds each route reached by the chapter that claims it", () => {
    // The same rule as topics, applied to pages: an entry that names a chapter
    // which never goes there is a claim, not a fact. Sub-routes are reached
    // from their parent list, so the top segment is what has to appear.
    const unvisited = GUIDE_FEATURES.filter((feature) => {
      if (feature.chapter === null) return false;
      const top = feature.route.split("/")[0];
      const source = sourceOf(feature.chapter);
      return !(
        source.includes(`"${top}"`) || // resume(page, "x") / tour.goto("x")
        source.includes(`"/${top}"`) || // tour.nav("/x")
        source.includes(`/${top}`) // a URL assertion
      );
    }).map((feature) => `${feature.label} → ${feature.chapter} (${feature.route})`);
    expect(unvisited).toEqual([]);
  });
});

describe("the phone guide covers what it claims", () => {
  const MOBILE_DIR = path.join(ROOT, "e2e-guide-mobile");

  it("finds the evidence each phone topic claims", () => {
    const unproven = MOBILE_TOPICS.filter((topic) => {
      const file = path.join(MOBILE_DIR, `${topic.chapter}.spec.ts`);
      if (!fs.existsSync(file)) return true;
      return !fs.readFileSync(file, "utf8").includes(topic.evidence);
    }).map((topic) => `${topic.label} (${topic.chapter}: "${topic.evidence}")`);
    expect(unproven).toEqual([]);
  });

  it("has no phone chapter nobody declared", () => {
    const declared = new Set(MOBILE_TOPICS.map((topic) => topic.chapter));
    const files = fs
      .readdirSync(MOBILE_DIR)
      .filter((f) => /^\d\d-.*\.spec\.ts$/.test(f))
      .map((f) => f.replace(/\.spec\.ts$/, ""));
    expect(files.filter((f) => !declared.has(f))).toEqual([]);
  });
});
