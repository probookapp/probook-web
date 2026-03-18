"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState } from "react";
import { ThemeProvider } from "@/components/providers/ThemeContext";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { ServiceWorkerRegistration } from "./ServiceWorkerRegistration";
import { createIdbPersister } from "@/lib/query-persister";
import i18n from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { ResolvedLanguage } from "@/stores/useSettingsStore";

const persister = createIdbPersister();

interface ProvidersProps {
  children: React.ReactNode;
  locale: string;
  theme: 'light' | 'dark';
}

export function Providers({ children, locale, theme }: ProvidersProps) {
  // Locale comes from URL [locale] segment.
  // Set before any child renders so SSR output matches client hydration.
  useState(() => {
    const validLocale = (locale === 'fr' || locale === 'ar' ? locale : 'en') as ResolvedLanguage;
    if (i18n.language !== validLocale) {
      i18n.changeLanguage(validLocale);
    }
    useSettingsStore.setState({
      resolvedLanguage: validLocale,
    });
    if (typeof document !== 'undefined') {
      document.documentElement.lang = validLocale;
      document.documentElement.dir = validLocale === 'ar' ? 'rtl' : 'ltr';
    }
  });

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            gcTime: 1000 * 60 * 60 * 24 * 7,
            networkMode: "offlineFirst",
          },
          mutations: {
            networkMode: "offlineFirst",
          },
        },
      })
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        buster: "v1",
      }}
    >
      <ThemeProvider serverTheme={theme}>
        <AuthProvider>
          <ServiceWorkerRegistration />
          {children}
        </AuthProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
