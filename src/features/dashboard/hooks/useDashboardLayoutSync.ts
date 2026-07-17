import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useCompanySettings } from "@/features/settings/hooks/useSettings";
import { settingsApi } from "@/lib/api";
import { useDashboardStore } from "@/stores/useDashboardStore";
import { useDemoMode } from "@/components/providers/DemoModeProvider";

/**
 * Syncs the dashboard layout (card order/visibility) with the server so it
 * follows the user across devices. Hydrates the local store from
 * CompanySettings.dashboard_layout once on load, and exposes `save()` to persist
 * the current store state back to the server.
 */
export function useDashboardLayoutSync() {
  const { data: settings } = useCompanySettings();
  const hydrate = useDashboardStore((s) => s.hydrate);
  const hydratedRef = useRef(false);
  const { isDemoMode } = useDemoMode();

  useEffect(() => {
    if (hydratedRef.current) return;
    const layout = settings?.dashboard_layout;
    if (layout && (layout.order || layout.hidden)) {
      hydrate(layout);
      hydratedRef.current = true;
    }
  }, [settings, hydrate]);

  const saveMutation = useMutation({
    mutationFn: (layout: { order: string[]; hidden: string[] }) =>
      settingsApi.updateDashboardLayout(layout),
  });

  const save = () => {
    if (isDemoMode) return;
    const { order, hidden } = useDashboardStore.getState();
    saveMutation.mutate({ order, hidden });
  };

  return { save };
}
