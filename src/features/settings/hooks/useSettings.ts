import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";
import type { UpdateCompanySettingsInput } from "@/types";

export function useCompanySettings() {
  return useQuery({
    queryKey: ["company-settings"],
    queryFn: settingsApi.get,
  });
}

/**
 * Saving company settings writes the server's answer straight into the cache.
 *
 * Invalidating alone only marks the query stale and schedules a refetch, so for
 * the length of that round trip every other reader still held the old values —
 * and the fiscal profile is read all over the app (VAT scales, which company
 * identifiers a form asks for, stamp duty). Changing regime and immediately
 * opening a form could show the previous country's fields. The mutation already
 * returns the updated row, so there is nothing to wait for.
 */
export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateCompanySettingsInput) => settingsApi.update(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(["company-settings"], settings);
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
  });
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appLanguage, appTheme }: { appLanguage: string; appTheme: string }) =>
      settingsApi.updateAppSettings(appLanguage, appTheme),
    onSuccess: (settings) => {
      queryClient.setQueryData(["company-settings"], settings);
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
  });
}

export function useUploadLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => settingsApi.uploadLogo(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      queryClient.invalidateQueries({ queryKey: ["logo-base64"] });
    },
  });
}

export function useLogoBase64() {
  return useQuery({
    queryKey: ["logo-base64"],
    queryFn: settingsApi.getLogoBase64,
  });
}

export function useDeleteLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => settingsApi.deleteLogo(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      queryClient.invalidateQueries({ queryKey: ["logo-base64"] });
    },
  });
}
