import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { deliveryNoteApi } from "@/lib/api";
import type { CreateDeliveryNoteInput, UpdateDeliveryNoteInput } from "@/types";

export function useDeliveryNotes() {
  return useQuery({
    queryKey: ["deliveryNotes"],
    queryFn: deliveryNoteApi.getAll,
  });
}

export function useDeliveryNote(id: string) {
  return useQuery({
    queryKey: ["deliveryNotes", id],
    queryFn: () => deliveryNoteApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateDeliveryNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDeliveryNoteInput) => deliveryNoteApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
    },
  });
}

export function useUpdateDeliveryNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateDeliveryNoteInput) => deliveryNoteApi.update(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes", variables.id] });
    },
  });
}

export function useDeleteDeliveryNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deliveryNoteApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
    },
  });
}

export function useDuplicateDeliveryNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deliveryNoteApi.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
    },
  });
}

export function useConvertDeliveryNoteToInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deliveryNoteApi.convertToInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
    },
  });
}

export function useBatchDeleteDeliveryNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => deliveryNoteApi.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
    },
  });
}
