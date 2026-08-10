import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "@/stores/useToastStore";

/**
 * Turn a failed admin request into a readable sentence.
 *
 * `adminApiCall` throws `new Error(responseText)`, so the message is usually the
 * raw JSON error body — `{"error":"Coupon exhausted"}` or a validation envelope
 * with per-field details. Anything unparseable falls back to the raw text.
 */
export function describeAdminError(error: unknown, t: TFunction): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");

  let message = raw;
  try {
    const body = JSON.parse(raw) as { error?: string; details?: { message?: string }[] };
    if (typeof body?.error === "string") {
      const details = Array.isArray(body.details)
        ? body.details.map((d) => d?.message).filter(Boolean).join(", ")
        : "";
      message = details ? `${body.error}: ${details}` : body.error;
    }
  } catch {
    // Not a JSON body (network failure, HTML error page) — keep the raw text.
  }

  // The two the dashboard produces on its own are worth translating; the rest
  // are operational messages that read the same in every locale.
  if (/super admin access required/i.test(message)) return t("errors.superAdminOnly");
  if (/^unauthorized/i.test(message)) return t("errors.unauthorized");
  return message || t("errors.generic");
}

/**
 * Surface every failed admin mutation as an error toast.
 *
 * The admin pages call `mutateAsync` without a catch, so a rejected write — a
 * 403 for a non-super admin, an exhausted coupon, a duplicate slug, a dropped
 * connection — used to leave no trace on screen at all. Subscribing to the
 * mutation cache here rather than configuring the shared QueryClient keeps the
 * tenant app's offline-first mutations (which fail by design while offline and
 * are retried by the sync manager) untouched: this only runs while the admin
 * chrome is mounted.
 */
export function useAdminMutationErrors() {
  const queryClient = useQueryClient();
  const { t } = useTranslation("admin");

  useEffect(() => {
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "error") return;
      toast.error(describeAdminError(event.action.error, t));
    });
  }, [queryClient, t]);
}
