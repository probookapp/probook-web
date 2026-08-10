import { useTranslation } from "react-i18next";
import { useAdminAuthStore } from "@/stores/useAdminAuthStore";

/** Whether the signed-in platform admin may perform write actions. */
export function useIsSuperAdmin(): boolean {
  const { currentAdmin } = useAdminAuthStore();
  return currentAdmin?.role === "super_admin";
}

interface SuperAdminOnly {
  /** True when the current admin may write. */
  allowed: boolean;
  /** Spread on a <Button>: disabled with a hover explanation. */
  button: { disabled?: boolean; disabledReason?: string };
  /**
   * Spread on a bare icon <button>. Give those buttons the
   * `disabled:opacity-40 disabled:cursor-not-allowed` classes so the state
   * reads visually — spreading a className here would clobber their own.
   */
  icon: { disabled?: boolean; title?: string };
}

/**
 * Gate write controls behind the super-admin role.
 *
 * Every admin mutation route is `withSuperAdmin`, so a plain platform admin
 * clicking one only ever got a 403 — and, before the error toast existed,
 * nothing at all. Disabling with a hover reason explains the boundary instead
 * of hiding what the dashboard can do.
 *
 *   const superOnly = useSuperAdminOnly();
 *   <Button {...superOnly.button} onClick={...}>Suspend</Button>
 *   <button {...superOnly.icon} onClick={...}><Trash2 /></button>
 */
export function useSuperAdminOnly(): SuperAdminOnly {
  const allowed = useIsSuperAdmin();
  const { t } = useTranslation("admin");

  if (allowed) return { allowed, button: {}, icon: {} };

  const reason = t("errors.superAdminOnly");
  return {
    allowed,
    button: { disabled: true, disabledReason: reason },
    icon: { disabled: true, title: reason },
  };
}
