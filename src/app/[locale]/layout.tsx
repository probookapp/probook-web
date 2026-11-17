import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Providers } from "@/components/providers/Providers";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/locales";
import { seo } from "@/lib/seo";
import type { Metadata } from "next";

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

/**
 * The tab title for pages that declare none (the whole back office renders on
 * the client), in the page's own language rather than the root's English.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const home = seo.home[locale as keyof typeof seo.home] ?? seo.home.fr;
  return { title: { default: home.title, template: "%s | Probook" } };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!SUPPORTED_LOCALES.includes(locale as Locale)) {
    notFound();
  }

  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("NEXT_THEME")?.value;
  // Only what the first paint needs. A visitor with no cookie is resolved by
  // the bootstrap script in the root layout, from their own setting.
  const serverTheme = (themeCookie === "dark" ? "dark" : "light") as "light" | "dark";

  return <Providers locale={locale} theme={serverTheme}>{children}</Providers>;
}
