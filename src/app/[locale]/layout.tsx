import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Providers } from "@/components/providers/Providers";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/locales";

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
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
  const serverTheme = (themeCookie === "dark" ? "dark" : "light") as "light" | "dark";

  return <Providers locale={locale} theme={serverTheme}>{children}</Providers>;
}
