import type { Locale } from "@/lib/locales";
import { GUIDE_VIDEOS, type GuideVideo } from "@/content/guide/videos";

/**
 * The public video guide: one page per filmed chapter, under /[locale]/guide.
 *
 * Each entry points at a chapter of the e2e-guide suites (`source`), which is
 * both the test that walks the flow and the take that films it. The narration
 * printed under each video comes from that same file (see
 * scripts/build-guide-content.mjs), so the page says what the video says.
 *
 * src/lib/__tests__/guide-content.test.ts holds this list to the chapters on
 * disk and to e2e-guide/feature-inventory.ts: a chapter added without a page,
 * or a page whose routes disagree with the inventory, fails the build.
 */
export type GuideGroup = "start" | "sell" | "stock" | "deliver" | "manage" | "account" | "phone";

export const GUIDE_GROUPS: GuideGroup[] = [
  "start",
  "sell",
  "stock",
  "deliver",
  "manage",
  "account",
  "phone",
];

export interface GuideChapter {
  /** The URL segment, in English like every other public path. */
  slug: string;
  /** Suite and chapter file: "desktop/04-devis". */
  source: string;
  group: GuideGroup;
  /** Desktop chapters are filmed 16:9, the phone ones portrait. */
  format: "landscape" | "portrait";
  /**
   * Application routes this chapter shows, as feature-inventory.ts names them.
   * The in-app help button uses them to open the right chapter.
   */
  routes: string[];
}

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    slug: "getting-started",
    source: "desktop/01-demarrage",
    group: "start",
    format: "landscape",
    routes: ["dashboard"],
  },
  {
    slug: "clients",
    source: "desktop/02-clients",
    group: "sell",
    format: "landscape",
    routes: ["clients", "phonebook"],
  },
  {
    slug: "products",
    source: "desktop/03-produits",
    group: "sell",
    format: "landscape",
    routes: ["products"],
  },
  {
    slug: "quotes",
    source: "desktop/04-devis",
    group: "sell",
    format: "landscape",
    routes: ["quotes", "quotes/new", "quotes/[id]", "quotes/[id]/edit"],
  },
  {
    slug: "invoices",
    source: "desktop/05-factures",
    group: "sell",
    format: "landscape",
    routes: [
      "invoices",
      "invoices/new",
      "invoices/[id]",
      "invoices/[id]/edit",
      "invoices/credit-notes",
      "invoices/credit-notes/[id]",
    ],
  },
  {
    slug: "point-of-sale",
    source: "desktop/06-caisse",
    group: "sell",
    format: "landscape",
    routes: ["pos"],
  },
  {
    slug: "purchases",
    source: "desktop/07-achats",
    group: "stock",
    format: "landscape",
    routes: [
      "suppliers",
      "purchases",
      "purchases/new",
      "purchases/[id]",
      "purchases/[id]/edit",
      "purchases/returns",
      "purchases/returns/new",
      "purchases/returns/[id]",
    ],
  },
  {
    slug: "stock-locations",
    source: "desktop/08-stock",
    group: "stock",
    format: "landscape",
    routes: ["locations", "locations/transfers/new", "locations/transfers/[id]"],
  },
  {
    slug: "delivery-notes-and-expenses",
    source: "desktop/09-livraisons-depenses",
    group: "deliver",
    format: "landscape",
    routes: [
      "delivery-notes",
      "delivery-notes/new",
      "delivery-notes/[id]",
      "delivery-notes/[id]/edit",
      "expenses",
    ],
  },
  {
    slug: "reports",
    source: "desktop/10-rapports",
    group: "manage",
    format: "landscape",
    routes: ["reports"],
  },
  {
    slug: "settings",
    source: "desktop/11-parametres",
    group: "account",
    format: "landscape",
    routes: ["settings"],
  },
  {
    slug: "subscription",
    source: "desktop/12-abonnement",
    group: "account",
    format: "landscape",
    routes: [],
  },
  {
    slug: "phone-quote-on-site",
    source: "mobile/01-devis-terrain",
    group: "phone",
    format: "portrait",
    routes: [],
  },
  {
    slug: "phone-collect-payment",
    source: "mobile/02-encaisser",
    group: "phone",
    format: "portrait",
    routes: [],
  },
  {
    slug: "phone-counter-sale",
    source: "mobile/03-comptoir",
    group: "phone",
    format: "portrait",
    routes: [],
  },
  {
    slug: "phone-track-activity",
    source: "mobile/04-pilotage",
    group: "phone",
    format: "portrait",
    routes: [],
  },
];

export function guideChapter(slug: string): GuideChapter | undefined {
  return GUIDE_CHAPTERS.find((c) => c.slug === slug);
}

/** The YouTube upload for this chapter in this language, once there is one. */
export function guideVideo(chapter: GuideChapter, locale: Locale): GuideVideo | null {
  return GUIDE_VIDEOS[chapter.source]?.[locale] ?? null;
}

/** The chapters before and after, in the order the guide is meant to be watched. */
export function guideNeighbours(chapter: GuideChapter) {
  const i = GUIDE_CHAPTERS.indexOf(chapter);
  return { previous: GUIDE_CHAPTERS[i - 1] ?? null, next: GUIDE_CHAPTERS[i + 1] ?? null };
}

/**
 * Which chapter explains the application page at `pathname`, for the help
 * button. `pathname` is the browser path ("/fr/quotes/3f2a…/edit"); ids are
 * matched against the inventory's "[id]" segments.
 */
export function guideChapterForPath(pathname: string): GuideChapter | null {
  const segments = pathname.split("/").filter(Boolean).slice(1); // drop the locale
  let best: { chapter: GuideChapter; length: number } | null = null;
  for (const chapter of GUIDE_CHAPTERS) {
    for (const route of chapter.routes) {
      const parts = route.split("/");
      if (parts.length > segments.length) continue;
      const matches = parts.every((p, i) => p === "[id]" || p === segments[i]);
      // The longest route wins, so "invoices/credit-notes" beats "invoices".
      if (matches && (!best || parts.length > best.length)) {
        best = { chapter, length: parts.length };
      }
    }
  }
  return best?.chapter ?? null;
}
