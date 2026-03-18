"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "@/lib/navigation";
import { adminTenantsApi } from "@/lib/admin-api";

interface ImpersonationStatus {
  impersonating: boolean;
  tenant_id?: string;
  admin_id?: string;
  tenant_name?: string;
}

export function ImpersonationBar() {
  const { t } = useTranslation("admin");
  const router = useRouter();
  const [status, setStatus] = useState<ImpersonationStatus | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/impersonation/status", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch {
        // Silently fail - impersonation bar is not critical
      }
    }
    checkStatus();
  }, []);

  if (!status?.impersonating) return null;

  const handleExit = async () => {
    setExiting(true);
    try {
      await adminTenantsApi.stopImpersonation();
      setStatus({ impersonating: false });
      router.push("/admin/tenants");
    } catch {
      setExiting(false);
    }
  };

  return (
    <div className="bg-yellow-400 dark:bg-yellow-500 text-yellow-900 px-4 py-2 text-sm font-medium flex items-center justify-center gap-3 sticky top-0 z-50">
      <span>
        {t("impersonation.viewing_as", {
          tenant: status.tenant_name || status.tenant_id,
        })}
      </span>
      <button
        onClick={handleExit}
        disabled={exiting}
        className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50"
      >
        {exiting
          ? t("impersonation.exiting")
          : t("impersonation.exit")}
      </button>
    </div>
  );
}
