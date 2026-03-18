"use client";

import { X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { tenantAnnouncementsApi } from "@/lib/admin-api";

type Announcement = Record<string, unknown>;

export function AnnouncementBanner() {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const { data: announcements } = useQuery({
    queryKey: ["active-announcements"],
    queryFn: tenantAnnouncementsApi.getActive,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => tenantAnnouncementsApi.dismiss(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-announcements"] });
    },
  });

  const list = (announcements || []) as Announcement[];

  if (list.length === 0) return null;

  return (
    <div className="space-y-2">
      {list.map((announcement) => (
        <div
          key={String(announcement.id)}
          className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 flex items-start gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {String(announcement.title || "")}
            </p>
            {announcement.body ? (
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                {String(announcement.body)}
              </p>
            ) : null}
          </div>
          <button
            onClick={() => dismissMutation.mutate(String(announcement.id))}
            className="flex-shrink-0 p-1 text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 transition-colors"
            aria-label={t("common.dismiss")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
