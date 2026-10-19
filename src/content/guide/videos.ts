import type { Locale } from "@/lib/locales";

/**
 * The YouTube uploads of the guide, per chapter and language.
 *
 * Fill one line per upload: the 11-character id from the video's URL
 * (youtube.com/watch?v=<id>) and the day it went up, which search engines
 * require on a video page. A chapter with no entry for a language still has its
 * page — the transcript, without a player — so the guide can go live before
 * every video is uploaded.
 *
 * Keys are the chapter sources from src/lib/guide.ts.
 *
 *   "desktop/04-devis": {
 *     fr: { id: "AbCdEfGhIjK", uploadDate: "2026-10-20" },
 *   },
 */
export interface GuideVideo {
  id: string;
  /** ISO date, YYYY-MM-DD. */
  uploadDate: string;
}

export const GUIDE_VIDEOS: Record<string, Partial<Record<Locale, GuideVideo>>> = {};
