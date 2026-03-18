"use client";

import { useState } from "react";
import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { Mail, MapPin, Clock } from "lucide-react";
import { PublicLayout } from "./PublicLayout";

export function ContactPage() {
  const { t } = useTranslation("pages");
  const locale = useLocale();
  const isRtl = locale === "ar";
  const textDir = isRtl ? "rtl" : undefined;

  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // For now, just show a success message. Backend integration can be added later.
    setSubmitted(true);
  };

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h1 dir={textDir} className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white tracking-tight">
            {t("contact.title")}
          </h1>
          <p dir={textDir} className="mt-4 text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
            {t("contact.subtitle")}
          </p>
        </div>
      </section>

      <section className="pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-12">
          {/* Contact info */}
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary-50 dark:bg-primary-950 shrink-0">
                <Mail className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h3 dir={textDir} className="font-semibold text-gray-900 dark:text-white">
                  {t("contact.emailTitle")}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  support@probookapp.net
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary-50 dark:bg-primary-950 shrink-0">
                <MapPin className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h3 dir={textDir} className="font-semibold text-gray-900 dark:text-white">
                  {t("contact.locationTitle")}
                </h3>
                <p dir={textDir} className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t("contact.locationText")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary-50 dark:bg-primary-950 shrink-0">
                <Clock className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h3 dir={textDir} className="font-semibold text-gray-900 dark:text-white">
                  {t("contact.hoursTitle")}
                </h3>
                <p dir={textDir} className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {t("contact.hoursText")}
                </p>
              </div>
            </div>
          </div>

          {/* Contact form */}
          <div className="lg:col-span-3">
            {submitted ? (
              <div className="rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-8 text-center">
                <h3 dir={textDir} className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">
                  {t("contact.successTitle")}
                </h3>
                <p dir={textDir} className="text-sm text-green-700 dark:text-green-300">
                  {t("contact.successMessage")}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label dir={textDir} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      {t("contact.nameLabel")}
                    </label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label dir={textDir} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      {t("contact.emailLabel")}
                    </label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label dir={textDir} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    {t("contact.subjectLabel")}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label dir={textDir} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    {t("contact.messageLabel")}
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-600 focus:border-transparent resize-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold transition-colors"
                >
                  {t("contact.sendButton")}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
