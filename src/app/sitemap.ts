import type { MetadataRoute } from "next";
import { GUIDE_CHAPTERS } from "@/lib/guide";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://probookapp.net";
const LOCALES = ["en", "fr", "ar"];

export default function sitemap(): MetadataRoute.Sitemap {
  const publicPages = [
    { path: "", priority: 1.0, changeFrequency: "weekly" as const },
    { path: "/pricing", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/about", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/contact", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/faq", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/guide", priority: 0.8, changeFrequency: "monthly" as const },
    ...GUIDE_CHAPTERS.map((c) => ({
      path: `/guide/${c.slug}`,
      priority: 0.6,
      changeFrequency: "monthly" as const,
    })),
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" as const },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const },
  ];

  return publicPages.flatMap(({ path, priority, changeFrequency }) =>
    LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency,
      priority,
      alternates: {
        languages: Object.fromEntries(
          LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`])
        ),
      },
    }))
  );
}
