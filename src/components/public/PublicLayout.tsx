"use client";

import Link from "next/link";
import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { MetaPixel } from "@/components/analytics/MetaPixel";

interface PublicLayoutProps {
  children: React.ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const { t, ready } = useTranslation("common");
  const locale = useLocale();

  if (!ready) return null;

  // No local .dark scope here. The root element already carries the theme,
  // stamped before the first paint, and duplicating it from React state made
  // this subtree's markup depend on a value the server cannot know — which is
  // the hydration mismatch that made React throw away the whole page and
  // rebuild it on every load where the stored theme differed from the cookie.
  return (
    <>
      <MetaPixel />
      <div className="min-h-screen bg-white dark:bg-gray-950 transition-colors flex flex-col">
        <Navbar
          actions={
            <>
              <Link
                href={`/${locale}/login`}
                className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors px-3 py-2"
              >
                {t("landing.hero.login")}
              </Link>
              <Link
                href={`/${locale}/signup`}
                className="text-sm font-medium text-white px-4 py-2 rounded-lg transition-colors bg-primary-600 hover:bg-primary-700"
              >
                {t("landing.hero.cta")}
              </Link>
            </>
          }
        />
        <main className="flex-1 pt-16">{children}</main>
        <Footer />
      </div>
    </>
  );
}
