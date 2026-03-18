"use client";

import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { Target, Heart, Zap, Shield } from "lucide-react";
import { PublicLayout } from "./PublicLayout";

const values = [
  { key: "simplicity", icon: Zap },
  { key: "reliability", icon: Shield },
  { key: "accessibility", icon: Heart },
  { key: "transparency", icon: Target },
] as const;

export function AboutPage() {
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
            {t("about.title")}
          </h1>
          <p dir={textDir} className="mt-4 text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            {t("about.subtitle")}
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h2 dir={textDir} className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            {t("about.storyTitle")}
          </h2>
          <div dir={textDir} className="prose dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 space-y-4">
            <p>{t("about.storyP1")}</p>
            <p>{t("about.storyP2")}</p>
            <p>{t("about.storyP3")}</p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto">
          <h2 dir={textDir} className="text-2xl font-bold text-gray-900 dark:text-white mb-12 text-center">
            {t("about.valuesTitle")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map(({ key, icon: Icon }) => (
              <div key={key} className="text-center">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 bg-primary-50 dark:bg-primary-950">
                  <Icon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                </div>
                <h3 dir={textDir} className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {t(`about.values.${key}.title`)}
                </h3>
                <p dir={textDir} className="text-sm text-gray-500 dark:text-gray-400">
                  {t(`about.values.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 dir={textDir} className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            {t("about.missionTitle")}
          </h2>
          <p dir={textDir} className="text-lg text-gray-600 dark:text-gray-300 leading-relaxed">
            {t("about.missionText")}
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
