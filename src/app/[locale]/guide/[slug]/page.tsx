import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generatePageMetadata, seo } from "@/lib/seo";
import { BreadcrumbJsonLd, VideoObjectJsonLd } from "@/lib/structured-data";
import { isValidLocale, type Locale } from "@/lib/locales";
import { GUIDE_CHAPTERS, guideChapter, guideVideo } from "@/lib/guide";
import { GuideChapterPage } from "@/components/public/guide/GuideChapterPage";
import transcripts from "@/content/guide/transcripts.json";
import frPages from "@/i18n/locales/fr/pages.json";
import enPages from "@/i18n/locales/en/pages.json";
import arPages from "@/i18n/locales/ar/pages.json";

type Props = { params: Promise<{ locale: string; slug: string }> };

const PAGES = { fr: frPages, en: enPages, ar: arPages } as const;

export function generateStaticParams() {
  return GUIDE_CHAPTERS.map((c) => ({ slug: c.slug }));
}

/** What the server needs to know about one chapter, before React renders it. */
function resolve(localeParam: string, slug: string) {
  const chapter = guideChapter(slug);
  if (!chapter) return null;
  const locale: Locale = isValidLocale(localeParam) ? localeParam : "en";
  const text = PAGES[locale].guide.chapters[slug as keyof typeof frPages.guide.chapters];
  const transcript = (transcripts as Record<string, Record<Locale, string[]>>)[chapter.source][locale];
  return { chapter, locale, text, transcript, video: guideVideo(chapter, locale) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = resolve(locale, slug);
  if (!page) return {};
  return generatePageMetadata("guide", locale, {
    path: `/guide/${slug}`,
    title: `${page.text.title} — ${seo.guide[page.locale].title}`,
    description: page.text.description,
  });
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  const page = resolve(locale, slug);
  if (!page) notFound();

  const base = `${seo.siteUrl}/${page.locale}/guide`;
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: seo.guide[page.locale].title, url: base },
          { name: page.text.title, url: `${base}/${slug}` },
        ]}
      />
      {page.video && (
        <VideoObjectJsonLd
          name={page.text.title}
          description={page.text.description}
          youtubeId={page.video.id}
          uploadDate={page.video.uploadDate}
          transcript={page.transcript.join(" ")}
        />
      )}
      <GuideChapterPage slug={slug} transcript={page.transcript} />
    </>
  );
}
