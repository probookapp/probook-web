'use client';

import { useRouter as useNextRouter, useParams, usePathname } from 'next/navigation';
import type { NavigateOptions } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, isValidLocale } from './locales';
import type { Locale } from './locales';

// Re-export everything from locales for convenience
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, isValidLocale };
export type { Locale };

// Re-export hooks that don't need locale wrapping
export { useParams, usePathname };

/**
 * Returns the current locale from the URL [locale] segment.
 */
export function useLocale(): Locale {
  const params = useParams();
  const locale = params?.locale as string;
  return isValidLocale(locale) ? locale : DEFAULT_LOCALE;
}

/**
 * Drop-in replacement for next/navigation's useRouter.
 * Automatically prefixes push/replace paths with the current locale.
 */
export function useRouter() {
  const router = useNextRouter();
  const locale = useLocale();

  return {
    ...router,
    push: (path: string, options?: NavigateOptions) => {
      return router.push(localizePath(path, locale), options);
    },
    replace: (path: string, options?: NavigateOptions) => {
      return router.replace(localizePath(path, locale), options);
    },
  };
}

/**
 * Prefix a path with the locale, unless it already has one.
 */
export function localizePath(path: string, locale: string): string {
  // Don't prefix external URLs, hash links, or already-localized paths
  if (path.startsWith('http') || path.startsWith('#')) return path;

  // Check if path already starts with a locale segment
  for (const loc of SUPPORTED_LOCALES) {
    if (path === `/${loc}` || path.startsWith(`/${loc}/`)) {
      return path;
    }
  }

  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${normalizedPath}`;
}
