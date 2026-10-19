import { describe, it, expect } from "vitest";
import path from "node:path";
import { GUIDE_FEATURES } from "../../../e2e-guide/feature-inventory";
import { buildTranscripts, chapterFiles } from "../../../scripts/guide-narration.mjs";
import { GUIDE_CHAPTERS, GUIDE_GROUPS, guideChapterForPath } from "../guide";
import { GUIDE_VIDEOS } from "../../content/guide/videos";
import transcripts from "../../content/guide/transcripts.json";
import frPages from "../../i18n/locales/fr/pages.json";
import enPages from "../../i18n/locales/en/pages.json";
import arPages from "../../i18n/locales/ar/pages.json";

/**
 * The public /guide pages against the chapters they show.
 *
 * Each page prints a transcript generated from its chapter and opens from the
 * help button of the application pages that chapter films. Both drift silently
 * — an edited narration keeps its old transcript, a renamed route loses its
 * help link — so they are checked here rather than noticed by a visitor.
 */
const ROOT = process.cwd();

const sourceOf = (file: string) =>
  `${path.basename(path.dirname(file)) === "e2e-guide" ? "desktop" : "mobile"}/${path.basename(
    file,
    ".spec.ts"
  )}`;

describe("guide pages", () => {
  it("have a transcript matching what the chapters say", () => {
    // Fix: `npm run guide:content`, then commit src/content/guide/transcripts.json.
    expect(transcripts, "transcripts.json is stale — run npm run guide:content").toEqual(
      buildTranscripts(ROOT)
    );
  });

  it("exist for every filmed chapter, and only for those", () => {
    const filmed = chapterFiles(ROOT).map(sourceOf).sort();
    const paged = GUIDE_CHAPTERS.map((c) => c.source).sort();
    expect(paged).toEqual(filmed);
  });

  it("have unique slugs and known groups", () => {
    const slugs = GUIDE_CHAPTERS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of GUIDE_CHAPTERS) {
      expect(GUIDE_GROUPS).toContain(c.group);
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("claim the same routes as the feature inventory", () => {
    // The help button opens the chapter whose routes contain the page; the
    // inventory says which chapter films each page. They must agree.
    const fromInventory = new Map<string, string[]>();
    for (const f of GUIDE_FEATURES) {
      if (!f.chapter) continue;
      const key = `desktop/${f.chapter}`;
      fromInventory.set(key, [...(fromInventory.get(key) ?? []), f.route]);
    }
    for (const c of GUIDE_CHAPTERS) {
      expect([...c.routes].sort(), c.slug).toEqual((fromInventory.get(c.source) ?? []).sort());
    }
  });

  it("send the help button to the most specific chapter", () => {
    expect(guideChapterForPath("/fr/quotes")?.slug).toBe("quotes");
    expect(guideChapterForPath("/fr/quotes/3f2a/edit")?.slug).toBe("quotes");
    expect(guideChapterForPath("/en/invoices/credit-notes/9")?.slug).toBe("invoices");
    expect(guideChapterForPath("/ar/locations/transfers/new")?.slug).toBe("stock-locations");
    expect(guideChapterForPath("/fr/admin/tenants")).toBeNull();
  });

  it("have a title and a description in every language", () => {
    for (const [locale, pages] of Object.entries({ fr: frPages, en: enPages, ar: arPages })) {
      const chapters = (pages as { guide: { chapters: Record<string, { title?: string; description?: string }> } })
        .guide.chapters;
      for (const c of GUIDE_CHAPTERS) {
        expect(chapters[c.slug]?.title, `${locale} ${c.slug} title`).toBeTruthy();
        expect(chapters[c.slug]?.description, `${locale} ${c.slug} description`).toBeTruthy();
      }
    }
  });

  it("point at real YouTube uploads", () => {
    const sources = new Set(GUIDE_CHAPTERS.map((c) => c.source));
    for (const [source, byLocale] of Object.entries(GUIDE_VIDEOS)) {
      expect(sources, `unknown chapter ${source}`).toContain(source);
      for (const video of Object.values(byLocale)) {
        expect(video!.id).toMatch(/^[A-Za-z0-9_-]{11}$/);
        expect(video!.uploadDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});
