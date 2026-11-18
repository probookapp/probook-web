import type { Locale } from "@/lib/locales";
import type { GuideChapter } from "@/lib/guide";
import transcripts from "@/content/guide/transcripts.json";
import screens from "@/content/guide/screens.json";

/**
 * A guide chapter's steps: each sentence of its narration, with the screen the
 * step leaves behind when there is one.
 *
 * Server-side only — the two JSON files are the whole guide in three
 * languages, and the pages pass each chapter its own steps as props. The text
 * comes from the chapters' narration (scripts/build-guide-content.mjs); the
 * images are screenshots taken by those same chapters while they verify the
 * flow (scripts/build-guide-images.mjs), hosted on the R2 bucket under guide/.
 */
export interface GuideImage {
  src: string;
  width: number;
  height: number;
}

export interface GuideStep {
  text: string;
  image: GuideImage | null;
}

type Shot = { k: string; w: number; h: number } | null;

/** Where the images are served; overridable for a local copy. */
const IMAGES_URL = (process.env.NEXT_PUBLIC_GUIDE_IMAGES_URL ?? "https://files.probookapp.net/guide").replace(/\/+$/, "");

function image(shot: Shot | undefined): GuideImage | null {
  return shot ? { src: `${IMAGES_URL}/${shot.k}`, width: shot.w, height: shot.h } : null;
}

export function guideSteps(chapter: GuideChapter, locale: Locale): GuideStep[] {
  const text = (transcripts as Record<string, Record<Locale, string[]>>)[chapter.source]?.[locale] ?? [];
  const shots = (screens as Record<string, Partial<Record<Locale, Shot[]>>>)[chapter.source]?.[locale] ?? [];
  return text.map((line, i) => ({ text: line, image: image(shots[i]) }));
}

/** The chapter's first picture, for its card on the guide's home and for sharing. */
export function guideCover(chapter: GuideChapter, locale: Locale): GuideImage | null {
  return guideSteps(chapter, locale).find((s) => s.image)?.image ?? null;
}
