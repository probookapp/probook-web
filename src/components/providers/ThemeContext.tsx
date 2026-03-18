"use client";

import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";

export type AppTheme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: AppTheme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: AppTheme) => void;
}

const ThemeCtx = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = "probook_theme";

function resolveTheme(theme: AppTheme): ResolvedTheme {
  if (theme === "system") {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  }
  return theme;
}

function persistThemeCookie(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.cookie = `NEXT_THEME=${resolved};path=/;max-age=31536000;SameSite=Lax`;
}

function applyThemeToDOM(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
}

interface ThemeProviderProps {
  children: ReactNode;
  /** Server-resolved theme from the NEXT_THEME cookie. Prevents hydration mismatch. */
  serverTheme: ResolvedTheme;
}

export function ThemeProvider({ children, serverTheme }: ThemeProviderProps) {
  // On first render, read localStorage to get the user's raw preference.
  // Fall back to the server-provided resolved theme (from cookie).
  const [theme, setThemeState] = useState<AppTheme>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === "light" || stored === "dark" || stored === "system") {
          return stored;
        }
      } catch {}
    }
    // No localStorage value — use the server theme as a concrete value
    return serverTheme;
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    // On server and initial client render, use the server value to match SSR output
    if (typeof window === "undefined") return serverTheme;
    // On client, resolve from the actual theme preference
    const stored = (() => {
      try {
        const s = localStorage.getItem(THEME_STORAGE_KEY);
        if (s === "light" || s === "dark" || s === "system") return s as AppTheme;
      } catch {}
      return serverTheme as AppTheme;
    })();
    return resolveTheme(stored);
  });

  const setTheme = useCallback((newTheme: AppTheme) => {
    const resolved = resolveTheme(newTheme);
    setThemeState(newTheme);
    setResolvedTheme(resolved);
    applyThemeToDOM(resolved);
    persistThemeCookie(resolved);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {}
  }, []);

  // Listen for system theme changes when theme is "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved = mq.matches ? "dark" : "light";
      setResolvedTheme(resolved);
      applyThemeToDOM(resolved);
      persistThemeCookie(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return (
    <ThemeCtx.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
