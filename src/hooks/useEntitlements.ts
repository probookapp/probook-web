"use client";

import { useQuery } from "@tanstack/react-query";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/feature-keys";
import type { Entitlement, QuotaUsage } from "@/app/api/entitlements/route";

type Entitlements = Partial<Record<FeatureKey, Entitlement>> & {
  quotas?: { max_users: QuotaUsage };
};

/** Included, until the server says otherwise. */
const OPEN: Entitlement = { included: true };

/**
 * What the account's offer includes, for the screens that show the rest as an
 * unlit entry. Cached for the session: an offer does not change while someone
 * is working, and the navigation reads this on every page.
 */
export function useEntitlements() {
  return useQuery<Entitlements>({
    queryKey: ["entitlements"],
    queryFn: async () => {
      const res = await fetch("/api/entitlements", { credentials: "include" });
      // A failed request must not empty the navigation. Unknown reads as
      // included, the same way the server resolves a key nobody configured.
      if (!res.ok) return {};
      return (await res.json()) as Entitlements;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * One feature's standing. Included while the request is in flight, so entries
 * do not vanish from the navigation and reappear on every page load.
 */
export function useFeature(key: FeatureKey): Entitlement {
  const { data } = useEntitlements();
  return (data?.[key] as Entitlement | undefined) ?? OPEN;
}

/** The team ceiling, unlimited until the server says otherwise. */
export function useUserQuota(): QuotaUsage {
  const { data } = useEntitlements();
  return data?.quotas?.max_users ?? { used: 0, limit: null };
}

export { FEATURE_KEYS };
export type { Entitlement, QuotaUsage };
