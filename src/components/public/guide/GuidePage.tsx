"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { PlayCircle, Smartphone } from "lucide-react";
import { useLocale } from "@/lib/navigation";
import type { Locale } from "@/lib/locales";
import { GUIDE_CHAPTERS, GUIDE_GROUPS, guideVideo, type GuideChapter } from "@/lib/guide";
import { PublicLayout } from "../PublicLayout";
import { guideChapterNumber } from "./chapter-number";

function ChapterCard({ chapter }: { chapter: GuideChapter }) {
  const { t } = useTranslation("pages");
  const locale = useLocale() as Locale;
  const video = guideVideo(chapter, locale);
  const number = guideChapterNumber(chapter);
  const portrait = chapter.format === "portrait";

  return (
    <Link
      href={`/${locale}/guide/${chapter.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="relative aspect-video bg-gray-100 dark:bg-gray-800">
        {video ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail
          <img
            src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-500">
            {portrait ? <Smartphone className="h-10 w-10" /> : <PlayCircle className="h-10 w-10" />}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        {number !== null && (
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
            {t("guide.chapter", { number })}
          </span>
        )}
        <h3 className="text-base font-semibold text-gray-900 group-hover:text-primary-700 dark:text-white dark:group-hover:text-primary-300">
          {t(`guide.chapters.${chapter.slug}.title`)}
        </h3>
        <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {t(`guide.chapters.${chapter.slug}.description`)}
        </p>
      </div>
    </Link>
  );
}

export function GuidePage() {
  const { t } = useTranslation("pages");
  const locale = useLocale();

  return (
    <PublicLayout>
      <section className="px-4 pb-10 pt-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
            {t("guide.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-500 dark:text-gray-400">
            {t("guide.subtitle")}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-12 px-4 pb-20 sm:px-6 lg:px-8">
        {GUIDE_GROUPS.map((group) => {
          const chapters = GUIDE_CHAPTERS.filter((c) => c.group === group);
          if (chapters.length === 0) return null;
          return (
            <section key={group} aria-labelledby={`guide-group-${group}`}>
              <h2
                id={`guide-group-${group}`}
                className="mb-1 text-xl font-bold text-gray-900 dark:text-white"
              >
                {t(`guide.groups.${group}`)}
              </h2>
              {group === "phone" && (
                <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t("guide.phoneIntro")}</p>
              )}
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {chapters.map((chapter) => (
                  <ChapterCard key={chapter.slug} chapter={chapter} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="bg-gray-50 px-4 py-16 dark:bg-gray-900 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">{t("guide.ctaTitle")}</h2>
          <p className="mb-6 text-gray-500 dark:text-gray-400">{t("guide.ctaSubtitle")}</p>
          <Link
            href={`/${locale}/signup`}
            className="inline-flex items-center rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
          >
            {t("guide.ctaButton")}
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
