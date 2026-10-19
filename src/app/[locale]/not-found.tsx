"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/lib/navigation";
import { PublicLayout } from "@/components/public/PublicLayout";

/**
 * What a `notFound()` inside a locale shows — a guide chapter that does not
 * exist, for instance.
 *
 * Without it Next fell back to its bare built-in page, which rebuilt the root
 * layout in the browser and logged a warning about the theme script there. This
 * one stays inside the site's own shell, in the visitor's language, and offers
 * the two places someone looking for a page most likely meant.
 */
export default function NotFound() {
  const { t } = useTranslation("pages");
  const locale = useLocale();

  return (
    <PublicLayout>
      <section className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-sm font-semibold text-primary-600 dark:text-primary-400">404</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            {t("notFound.title")}
          </h1>
          <p className="mt-4 text-gray-500 dark:text-gray-400">{t("notFound.subtitle")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={`/${locale}`}
              className="inline-flex items-center rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              {t("notFound.home")}
            </Link>
            <Link
              href={`/${locale}/guide`}
              className="inline-flex items-center rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              {t("notFound.guide")}
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
