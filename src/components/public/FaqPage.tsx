"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { PublicLayout } from "./PublicLayout";

const faqKeys = [
  "whatIsProbook",
  "howToStart",
  "freeTrial",
  "cancelAnytime",
  "offlineWork",
  "languages",
  "dataExport",
  "support",
] as const;

function FaqItem({ questionKey }: { questionKey: string }) {
  const { t } = useTranslation("pages");
  const locale = useLocale();
  const isRtl = locale === "ar";
  const textDir = isRtl ? "rtl" : undefined;
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-200 dark:border-gray-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left"
      >
        <span dir={textDir} className="text-base font-medium text-gray-900 dark:text-white">
          {t(`faq.items.${questionKey}.q`)}
        </span>
        <ChevronDown
          className={`h-5 w-5 text-gray-400 shrink-0 ml-4 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div dir={textDir} className="pb-5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          {t(`faq.items.${questionKey}.a`)}
        </div>
      )}
    </div>
  );
}

export function FaqPage() {
  const { t } = useTranslation("pages");
  const locale = useLocale();
  const isRtl = locale === "ar";
  const textDir = isRtl ? "rtl" : undefined;

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h1 dir={textDir} className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white tracking-tight">
            {t("faq.title")}
          </h1>
          <p dir={textDir} className="mt-4 text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
            {t("faq.subtitle")}
          </p>
        </div>
      </section>

      {/* FAQ items */}
      <section className="pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          {faqKeys.map((key) => (
            <FaqItem key={key} questionKey={key} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto text-center">
          <h2 dir={textDir} className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {t("faq.ctaTitle")}
          </h2>
          <p dir={textDir} className="text-gray-500 dark:text-gray-400 mb-6">
            {t("faq.ctaSubtitle")}
          </p>
          <Link
            href={`/${locale}/contact`}
            className="inline-flex items-center px-6 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold transition-colors"
          >
            {t("faq.ctaButton")}
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
