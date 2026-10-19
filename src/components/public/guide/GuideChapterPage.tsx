"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, ExternalLink, PlayCircle } from "lucide-react";
import { useLocale } from "@/lib/navigation";
import type { Locale } from "@/lib/locales";
import { guideChapter, guideNeighbours, guideVideo } from "@/lib/guide";
import { PublicLayout } from "../PublicLayout";
import { YouTubePlayer } from "./YouTubePlayer";
import { guideChapterNumber } from "./chapter-number";

interface GuideChapterPageProps {
  slug: string;
  /** The chapter's narration in the page language, from transcripts.json. */
  transcript: string[];
}

export function GuideChapterPage({ slug, transcript }: GuideChapterPageProps) {
  const { t } = useTranslation("pages");
  const locale = useLocale() as Locale;
  const chapter = guideChapter(slug)!;
  const video = guideVideo(chapter, locale);
  const number = guideChapterNumber(chapter);
  const { previous, next } = guideNeighbours(chapter);
  const title = t(`guide.chapters.${slug}.title`);

  return (
    <PublicLayout>
      <article className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <Link
          href={`/${locale}/guide`}
          className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white lg:min-h-0"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("guide.backToGuide")}
        </Link>

        <header className="mb-6 mt-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
            {number !== null ? t("guide.chapter", { number }) : t("guide.groups.phone")}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">
            {t(`guide.chapters.${slug}.description`)}
          </p>
        </header>

        {video ? (
          <>
            <YouTubePlayer
              id={video.id}
              title={title}
              playLabel={t("guide.play", { title })}
              locale={locale}
              portrait={chapter.format === "portrait"}
            />
            <a
              href={`https://www.youtube.com/watch?v=${video.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white lg:min-h-0"
            >
              <ExternalLink className="h-4 w-4" />
              {t("guide.watchOnYouTube")}
            </a>
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
            <PlayCircle className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
            <p className="min-w-0 flex-1">{t("guide.comingSoon")}</p>
          </div>
        )}

        <section className="mt-10" aria-labelledby="guide-transcript">
          <h2 id="guide-transcript" className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
            {t("guide.transcript")}
          </h2>
          {/* The narration, one sentence per step, as it is captioned on screen. */}
          <ol className="space-y-3">
            {transcript.map((line, i) => (
              <li key={i} className="flex gap-3 text-gray-700 dark:text-gray-300">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold tabular-nums text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 leading-relaxed">{line}</span>
              </li>
            ))}
          </ol>
        </section>

        <nav className="mt-12 grid gap-3 border-t border-gray-200 pt-6 dark:border-gray-800 sm:grid-cols-2">
          {previous ? (
            <Link
              href={`/${locale}/guide/${previous.slug}`}
              className="rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
            >
              <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("guide.previous")}
              </span>
              <span className="mt-1 block font-medium text-gray-900 dark:text-white">
                {t(`guide.chapters.${previous.slug}.title`)}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={`/${locale}/guide/${next.slug}`}
              className="rounded-lg border border-gray-200 p-4 text-end transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
            >
              <span className="flex items-center justify-end gap-1 text-xs text-gray-500 dark:text-gray-400">
                {t("guide.next")}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
              <span className="mt-1 block font-medium text-gray-900 dark:text-white">
                {t(`guide.chapters.${next.slug}.title`)}
              </span>
            </Link>
          )}
        </nav>
      </article>

      <section className="bg-gray-50 px-4 py-14 dark:bg-gray-900 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-3 text-2xl font-bold text-gray-900 dark:text-white">{t("guide.ctaTitle")}</h2>
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
