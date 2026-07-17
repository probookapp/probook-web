"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, Button, Select } from "@/components/ui";
import { useAdminFeatures } from "@/features/admin/features/hooks/useFeatureFlags";
import {
  useTenantFeatures,
  useUpdateTenantFeatures,
} from "@/features/admin/features/hooks/useFeatureFlags";

type Feature = Record<string, unknown>;
type Override = Record<string, unknown>;

// Per-feature override state for a single tenant: "inherit" keeps the global
// default, "on"/"off" force an explicit override.
type OverrideState = "inherit" | "on" | "off";

export function TenantFeaturesTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation("admin");
  const { data: featuresData, isLoading: featuresLoading } = useAdminFeatures();
  const { data: overridesData, isLoading: overridesLoading } = useTenantFeatures(tenantId);
  const updateTenantFeatures = useUpdateTenantFeatures();

  const features = (featuresData || []) as Feature[];
  const overrides = (overridesData || []) as Override[];

  // Map featureId -> current override boolean (undefined = inherit)
  const overrideMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const o of overrides) {
      m.set(String(o.feature_id), Boolean(o.enabled));
    }
    return m;
  }, [overrides]);

  const [pending, setPending] = useState<Record<string, OverrideState>>({});

  const stateOf = (featureId: string): OverrideState => {
    if (pending[featureId]) return pending[featureId];
    if (!overrideMap.has(featureId)) return "inherit";
    return overrideMap.get(featureId) ? "on" : "off";
  };

  const setState = (featureId: string, next: OverrideState) => {
    setPending((prev) => ({ ...prev, [featureId]: next }));
  };

  const dirty = Object.keys(pending).length > 0;

  const handleSave = async () => {
    // Only "on"/"off" are persistable via the upsert API; "inherit" has no
    // delete endpoint, so it's a no-op here (surfaced in the helper text).
    const toSend = features
      .map((f) => {
        const id = String(f.id);
        const s = stateOf(id);
        if (s === "inherit") return null;
        return { feature_id: id, enabled: s === "on" };
      })
      .filter((x): x is { feature_id: string; enabled: boolean } => x !== null);

    await updateTenantFeatures.mutateAsync({ tenantId, input: { features: toSend } });
    setPending({});
  };

  if (featuresLoading || overridesLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("tenants.features.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t("tenants.features.help")}
        </p>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {features.map((f) => {
            const id = String(f.id);
            return (
              <div key={id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {String(f.name || f.key || "-")}
                  </p>
                  <p className="text-xs font-mono text-gray-400">{String(f.key || "")}</p>
                </div>
                <div className="w-40 shrink-0">
                  <Select
                    name={`feature-${id}`}
                    value={stateOf(id)}
                    onChange={(e) => setState(id, e.target.value as OverrideState)}
                    options={[
                      { value: "inherit", label: t("tenants.features.inherit") },
                      { value: "on", label: t("tenants.features.forceOn") },
                      { value: "off", label: t("tenants.features.forceOff") },
                    ]}
                  />
                </div>
              </div>
            );
          })}
          {features.length === 0 && (
            <p className="py-6 text-center text-gray-500 dark:text-gray-400">
              {t("tenants.features.empty")}
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} isLoading={updateTenantFeatures.isPending} disabled={!dirty}>
            {t("tenants.features.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
