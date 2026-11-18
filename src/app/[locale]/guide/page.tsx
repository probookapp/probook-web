import type { Metadata } from "next";
import { generatePageMetadata } from "@/lib/seo";
import { isValidLocale } from "@/lib/locales";
import { GUIDE_CHAPTERS } from "@/lib/guide";
import { guideCover } from "@/lib/guide-steps";
import { GuidePage } from "@/components/public/guide/GuidePage";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return generatePageMetadata("guide", locale, { path: "/guide" });
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  const lang = isValidLocale(locale) ? locale : "en";
  // Each chapter's card shows its first screen.
  const covers = Object.fromEntries(GUIDE_CHAPTERS.map((c) => [c.slug, guideCover(c, lang)]));
  return <GuidePage covers={covers} />;
}
