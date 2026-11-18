"use client";

import { useTranslation } from "react-i18next";
import { CircleHelp } from "lucide-react";
import { useLocale, usePathname } from "@/lib/navigation";
import { guideChapterForPath } from "@/lib/guide";

/**
 * The "?" beside a page title: opens the guide chapter that explains this page.
 *
 * Which chapter is read from the routes each chapter claims (src/lib/guide.ts),
 * so a new page gets its link by being added to the inventory, not here.
 */
export function GuideHelpLink() {
  const { t } = useTranslation("pages");
  const locale = useLocale();
  const pathname = usePathname();
  const chapter = guideChapterForPath(pathname ?? "");
  if (!chapter) return null;

  const label = t("guide.help");
  return (
    <a
      href={`/${locale}/guide/${chapter.slug}`}
      target="_blank"
      rel="noopener"
      title={label}
      aria-label={label}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-(--color-text-secondary) transition-colors hover:bg-gray-200 hover:text-(--color-text-primary) dark:hover:bg-gray-800"
    >
      <CircleHelp className="h-5 w-5" />
    </a>
  );
}
