"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, Globe } from "lucide-react";
import { useLocale, usePathname } from "@/lib/navigation";
import { Logo } from "@/components/shared/Logo";

const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
] as const;

const SELLING_POINTS = ["documents", "stock", "till", "offline"] as const;

interface AuthShellProps {
  children: React.ReactNode;
  /** Line under the brand on a phone, where the side panel is not shown. */
  subtitle?: string;
}

/**
 * The frame every sign-in page shares: the form on one side, on a wide screen
 * what the product does on the other, and above both a way back to the public
 * site and a language choice. These pages used to be a lone card on a grey
 * page, with no way back and no way to read them in another language.
 */
export function AuthShell({ children, subtitle }: AuthShellProps) {
  const { t } = useTranslation("auth");
  const locale = useLocale();
  const pathname = usePathname();

  const switchLanguage = (next: string) => {
    if (next === locale) return;
    // A full load, as on the public pages: the metadata is rendered per
    // language on the server.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = pathname.replace(`/${locale}`, `/${next}`) + window.location.search;
  };

  return (
    <div className="min-h-screen flex bg-(--color-bg-secondary)">
      <aside className="hidden lg:flex w-[44%] max-w-xl flex-col justify-between bg-(--color-sidebar-bg) p-12 text-white">
        <Link href={`/${locale}`} className="flex items-center gap-2.5 text-xl font-bold">
          <Logo className="h-8 w-8 text-white" title="Probook" />
          Probook
        </Link>
        <div>
          <p className="text-3xl font-semibold leading-tight">{t("shell.headline")}</p>
          <ul className="mt-8 space-y-4">
            {SELLING_POINTS.map((key) => (
              <li key={key} className="flex items-start gap-3 text-(--color-sidebar-text)">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary-300" />
                <span>{t(`shell.points.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-(--color-sidebar-text)">{t("shell.footer")}</p>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href={`/${locale}`}
            className="inline-flex min-h-10 items-center gap-1.5 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary)"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t("shell.backToSite")}
          </Link>
          <label className="inline-flex items-center gap-1.5 text-sm text-(--color-text-secondary)">
            <Globe className="h-4 w-4" />
            <span className="sr-only">{t("shell.language")}</span>
            <select
              value={locale}
              onChange={(e) => switchLanguage(e.target.value)}
              className="min-h-10 rounded-md bg-transparent pe-1 text-sm text-(--color-text-primary) focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <main className="flex flex-1 items-center justify-center px-4 pb-10 sm:px-6">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:hidden">
              <p className="flex items-center justify-center gap-2 text-3xl font-bold text-(--color-text-primary)">
                <Logo className="h-9 w-9" title="Probook" />
                Probook
              </p>
              {subtitle && <p className="mt-2 text-(--color-text-secondary)">{subtitle}</p>}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/** The white card the form sits in. */
export function AuthCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-(--color-border-primary) bg-(--color-bg-primary) p-6 shadow-sm sm:p-8 ${className}`}
    >
      {children}
    </div>
  );
}
