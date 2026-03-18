import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";
import type { UpdateCompanySettingsInput } from "@/types";

export function useCompanySettings() {
  return useQuery({
    queryKey: ["company-settings"],
    queryFn: settingsApi.get,
  });
}

export function useUpdateCompanySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateCompanySettingsInput) => settingsApi.update(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
  });
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appLanguage, appTheme }: { appLanguage: string; appTheme: string }) =>
      settingsApi.updateAppSettings(appLanguage, appTheme),
    onSuccess: () => {
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
