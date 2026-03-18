import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { quoteApi } from "@/lib/api";
import type { CreateQuoteInput, UpdateQuoteInput } from "@/types";

export function useQuotes() {
  return useQuery({
    queryKey: ["quotes"],
    queryFn: quoteApi.getAll,
  });
}

export function useQuote(id: string) {
  return useQuery({
    queryKey: ["quotes", id],
    queryFn: () => quoteApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateQuoteInput) => quoteApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useUpdateQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateQuoteInput) => quoteApi.update(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["quotes", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDeleteQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => quoteApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useConvertQuoteToInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => quoteApi.convertToInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDuplicateQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => quoteApi.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useConvertQuoteToDeliveryNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => quoteApi.convertToDeliveryNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useBatchDeleteQuotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => quoteApi.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
