"use client";

import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { PublicLayout } from "./PublicLayout";

const sectionKeys = [
  "dataCollection",
  "dataUsage",
  "dataStorage",
  "dataSecurity",
  "thirdParties",
  "cookies",
  "rights",
  "children",
  "changes",
  "contact",
] as const;

export function PrivacyPage() {
  const { t } = useTranslation("pages");
  const locale = useLocale();
  const isRtl = locale === "ar";
  const textDir = isRtl ? "rtl" : undefined;

  return (
    <PublicLayout>
      <section className="pt-16 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 dir={textDir} className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight mb-4">
            {t("privacy.title")}
          </h1>
          <p dir={textDir} className="text-sm text-gray-500 dark:text-gray-400 mb-12">
            {t("privacy.lastUpdated")}
          </p>

          <div className="space-y-10">
            {sectionKeys.map((key, idx) => (
              <div key={key}>
                <h2 dir={textDir} className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  {idx + 1}. {t(`privacy.sections.${key}.title`)}
                </h2>
                <p dir={textDir} className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {t(`privacy.sections.${key}.content`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
