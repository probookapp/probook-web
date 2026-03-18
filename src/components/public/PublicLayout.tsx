"use client";

import Link from "next/link";
import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/providers/ThemeContext";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

interface PublicLayoutProps {
  children: React.ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  const { t, ready } = useTranslation("common");
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  if (!ready) return null;

  return (
    <div className={isDark ? "dark" : ""}>
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
    </div>
  );
}
