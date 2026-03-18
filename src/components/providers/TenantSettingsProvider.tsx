"use client";

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { settingsApi } from '@/lib/api';

/**
 * Fetches tenant company-settings from the backend and initializes
 * tenant-specific settings (currency). Only used inside authenticated (app) routes.
 * Renders nothing — purely a side-effect component.
 */
export function TenantSettingsProvider() {
  const { isInitialized } = useSettingsStore();

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
    }
  }, [settings, isInitialized]);

  return null;
}
