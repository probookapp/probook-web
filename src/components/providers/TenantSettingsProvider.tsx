"use client";

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useTheme, type AppTheme } from '@/components/providers/ThemeContext';
import { settingsApi } from '@/lib/api';

const THEME_STORAGE_KEY = "probook_theme";

/**
 * Fetches tenant company-settings from the backend and initializes
 * tenant-specific settings (currency, theme). Only used inside authenticated (app) routes.
 * Renders nothing — purely a side-effect component.
 */
export function TenantSettingsProvider() {
  const { isInitialized } = useSettingsStore();
  const { setTheme } = useTheme();

  const { data: settings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: settingsApi.get,
  });

  useEffect(() => {
    if (settings && !isInitialized) {
      useSettingsStore.setState({
        currency: settings.currency || 'EUR',
        isInitialized: true,
      });

      // Sync theme from backend if localStorage has no value
      // (e.g., after clearing site data)
      if (settings.app_theme) {
        const hasLocalTheme = (() => {
          try { return !!localStorage.getItem(THEME_STORAGE_KEY); } catch { return false; }
        })();
        if (!hasLocalTheme) {
          setTheme(settings.app_theme as AppTheme);
        }
      }
    }
  }, [settings, isInitialized, setTheme]);

  return null;
}
