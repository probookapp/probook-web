import type { GuideChapter } from "@/lib/guide";

/**
 * The number a desktop chapter is filmed under ("desktop/04-devis" → 4), which
 * is also what its title card says. Phone chapters are a set of their own and
 * carry no number.
 */
export function guideChapterNumber(chapter: GuideChapter): number | null {
  const match = /^desktop\/(\d{2})-/.exec(chapter.source);
  return match ? Number(match[1]) : null;
}
