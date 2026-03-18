import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reminderApi } from "@/lib/api";
import type { CreateReminderInput } from "@/types";

export function useReminders() {
  return useQuery({
    queryKey: ["reminders"],
    queryFn: reminderApi.getAll,
  });
}

export function usePendingReminders() {
  return useQuery({
    queryKey: ["reminders", "pending"],
    queryFn: reminderApi.getPending,
    // Refetch every 5 minutes
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useRemindersByDocument(documentType: string, documentId: string) {
  return useQuery({
    queryKey: ["reminders", "document", documentType, documentId],
    queryFn: () => reminderApi.getByDocument(documentType, documentId),
    enabled: !!documentType && !!documentId,
  });
}

export function useCreateReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateReminderInput) => reminderApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
  });
}

export function useMarkReminderSent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reminderApi.markSent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
  });
}

export function useSendReminderEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await reminderApi.sendEmail(id) as Record<string, unknown>;
      // If Resend isn't configured, the API returns mailto data
      if (result?.mode === "mailto") {
        const mailto = `mailto:${encodeURIComponent(result.to as string)}?subject=${encodeURIComponent(result.subject as string)}&body=${encodeURIComponent(result.body as string)}`;
        window.open(mailto, "_blank");
        return result;
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reminderApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
  });
}

export function useCheckAndCreateReminders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => reminderApi.checkAndCreate(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
    },
  });
}
