"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/providers/ThemeContext";
import { Globe, ChevronDown, Sun, Moon, Menu, X } from "lucide-react";

const languages = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
] as const;

interface NavbarProps {
  actions?: React.ReactNode;
}

const navLinks = ["about", "faq", "pricing"] as const;

export function Navbar({ actions }: NavbarProps) {
  const { t } = useTranslation("common");
  const locale = useLocale();
  const { resolvedTheme, setTheme } = useTheme();
  const [langOpen, setLangOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  const isDark = resolvedTheme === "dark";
  const currentLang = languages.find((l) => l.code === locale) || languages[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleDarkMode = () => setTheme(isDark ? "light" : "dark");

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-gray-100 dark:border-gray-800 bg-white/85 dark:bg-gray-950/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href={`/${locale}`} className="flex items-center gap-2.5">
          <img src="/probook-icon.png" alt="Probook" className="h-8 w-8" />
          <span className="text-xl font-bold text-gray-900 dark:text-white">Probook</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((key) => (
            <Link
              key={key}
              href={`/${locale}/${key}`}
              className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {t(`landing.footer.${key}`)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Toggle dark mode"
          >
            {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </button>
          {/* Language switcher */}
          <div ref={langRef} className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors px-2.5 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">{currentLang.label}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {langOpen && (
              <div className="absolute right-0 mt-1 w-36 rounded-lg border border-gray-200 dark:border-gray-700 py-1 shadow-lg bg-white dark:bg-gray-900">
                {languages.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => {
                      setLangOpen(false);
                      if (l.code !== locale) {
                        window.location.href = `/${l.code}`;
                      }
                    }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      l.code === locale
                        ? "text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-3">
            {actions}
          </div>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl">
          <nav className="flex flex-col px-4 py-3 gap-1">
            {navLinks.map((key) => (
              <Link
                key={key}
                href={`/${locale}/${key}`}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {t(`landing.footer.${key}`)}
              </Link>
            ))}
            <div className="flex items-center gap-3 px-3 pt-2 border-t border-gray-100 dark:border-gray-800 mt-2">
              {actions}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
