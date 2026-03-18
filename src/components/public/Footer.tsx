"use client";

import Link from "next/link";
import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation("common");
  const locale = useLocale();
  const isRtl = locale === "ar";
  const textDir = isRtl ? "rtl" : undefined;

  return (
    <footer className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900 dark:bg-gray-950 text-gray-400">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2.5 mb-6">
              <img src="/probook-icon.png" alt="Probook" className="h-7 w-7" />
              <span className="text-lg font-bold text-white">Probook</span>
            </div>
            <p dir={textDir} className="text-sm leading-relaxed">
              {t("landing.hero.subtitle").split(".")[0]}.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-4 text-white">
              {t("landing.footer.product")}
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href={`/${locale}/#features`} className="hover:text-white transition-colors">
                  {t("landing.footer.features")}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/pricing`} className="hover:text-white transition-colors">
                  {t("landing.footer.pricing")}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-4 text-white">
              {t("landing.footer.company")}
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href={`/${locale}/about`} className="hover:text-white transition-colors">
                  {t("landing.footer.about")}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/contact`} className="hover:text-white transition-colors">
                  {t("landing.footer.contact")}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/faq`} className="hover:text-white transition-colors">
                  {t("landing.footer.faq")}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-4 text-white">
              {t("landing.footer.legal")}
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href={`/${locale}/privacy`} className="hover:text-white transition-colors">
                  {t("landing.footer.privacy")}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/terms`} className="hover:text-white transition-colors">
                  {t("landing.footer.terms")}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 text-center text-sm border-t border-gray-800">
          &copy; {new Date().getFullYear()} Probook.{" "}
          {t("landing.footer.rights")}
        </div>
      </div>
    </footer>
  );
}
