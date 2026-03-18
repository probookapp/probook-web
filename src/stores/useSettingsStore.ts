import { create } from 'zustand';
import i18n from '@/i18n';

export type AppLanguage = 'system' | 'fr' | 'en' | 'ar';
export type AppTheme = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export type ResolvedLanguage = 'fr' | 'en' | 'ar';

interface SettingsState {
  // Language
  language: AppLanguage;
  resolvedLanguage: ResolvedLanguage;

  // Theme
  theme: AppTheme;
  resolvedTheme: ResolvedTheme;

  // Currency
  currency: string;

  // Loading state
  isInitialized: boolean;

  // Actions
  setLanguage: (language: AppLanguage) => void;
  setTheme: (theme: AppTheme) => void;
  setCurrency: (currency: string) => void;
  initializeFromBackend: (language: AppLanguage | null, theme: AppTheme | null, currency?: string | null) => void;
}

const getSystemLanguage = (): ResolvedLanguage => {
  if (typeof navigator === 'undefined') return 'en';
  const browserLang = navigator.language.split('-')[0];
  if (browserLang === 'fr' || browserLang === 'en' || browserLang === 'ar') {
    return browserLang;
  }
  return 'en';
};

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const LANGUAGE_STORAGE_KEY = 'probook_language';
const THEME_STORAGE_KEY = 'probook_theme';

// --- localStorage persistence ---

const persistLanguage = (language: AppLanguage) => {
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch {}
};

const loadPersistedLanguage = (): AppLanguage | null => {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'fr' || stored === 'en' || stored === 'ar' || stored === 'system') {
      return stored as AppLanguage;
    }
  } catch {}
  return null;
};

const persistTheme = (theme: AppTheme) => {
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
};

const loadPersistedTheme = (): AppTheme | null => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {}
  return null;
};

// --- Cookie persistence (readable by server/middleware) ---

const persistLocaleCookie = (resolved: ResolvedLanguage) => {
  if (typeof document === 'undefined') return;
  document.cookie = `NEXT_LOCALE=${resolved};path=/;max-age=31536000;SameSite=Lax`;
};

const persistThemeCookie = (resolved: ResolvedTheme) => {
  if (typeof document === 'undefined') return;
  document.cookie = `NEXT_THEME=${resolved};path=/;max-age=31536000;SameSite=Lax`;
};

// --- DOM helpers ---

const applyThemeToDOM = (theme: AppTheme, resolvedTheme: ResolvedTheme) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme === 'system' ? resolvedTheme : theme);
};

const applyLanguageToDOM = (resolved: ResolvedLanguage) => {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = resolved;
  document.documentElement.dir = resolved === 'ar' ? 'rtl' : 'ltr';
};

// --- Store initialization ---
// Language comes from the URL [locale] segment (set by Providers before first render).
// Theme is read from localStorage for the initial value; the cookie + inline script
// handle the CSS dark class to prevent FOUC.
const getInitialTheme = (): { theme: AppTheme; resolvedTheme: ResolvedTheme } => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'dark') return { theme: 'dark', resolvedTheme: 'dark' };
      if (stored === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return { theme: 'system', resolvedTheme: prefersDark ? 'dark' : 'light' };
      }
    } catch {}
  }
  return { theme: 'light', resolvedTheme: 'light' };
};

const initialTheme = getInitialTheme();

export const useSettingsStore = create<SettingsState>()((set) => ({
  language: 'en',
  resolvedLanguage: 'en',
  theme: initialTheme.theme,
  resolvedTheme: initialTheme.resolvedTheme,
  currency: 'EUR',
  isInitialized: false,

  setLanguage: (language) => {
    const resolved = language === 'system' ? getSystemLanguage() : language;
    set({ language, resolvedLanguage: resolved });
    persistLanguage(language);
    persistLocaleCookie(resolved);
    applyLanguageToDOM(resolved);
    if (i18n.language !== resolved) {
      i18n.changeLanguage(resolved);
    }
  },

  setTheme: (theme) => {
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    set({ theme, resolvedTheme: resolved });
    applyThemeToDOM(theme, resolved);
    persistTheme(theme);
    persistThemeCookie(resolved);
  },

  setCurrency: (currency) => {
    set({ currency });
  },

  initializeFromBackend: (language, theme, currency) => {
    const persistedLanguage = loadPersistedLanguage();
    const newLanguage = persistedLanguage || language || 'en';
    const persisted = loadPersistedTheme();
    const newTheme = persisted || theme || 'light';
    const resolvedLanguage = newLanguage === 'system' ? getSystemLanguage() : newLanguage;
    const resolvedTheme = newTheme === 'system' ? getSystemTheme() : newTheme;

    set({
      language: newLanguage,
      theme: newTheme,
      currency: currency || 'EUR',
      resolvedLanguage,
      resolvedTheme,
      isInitialized: true,
    });
    applyThemeToDOM(newTheme, resolvedTheme);
    persistThemeCookie(resolvedTheme);
    persistLocaleCookie(resolvedLanguage);
    if (i18n.language !== resolvedLanguage) {
      i18n.changeLanguage(resolvedLanguage);
    }
  },
}));
