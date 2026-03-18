import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoiceApi, paymentApi } from "@/lib/api";
import type { CreateInvoiceInput, UpdateInvoiceInput, CreatePaymentInput } from "@/types";

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: invoiceApi.getAll,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ["invoices", id],
    queryFn: () => invoiceApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateInvoiceInput) => invoiceApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateInvoiceInput) => invoiceApi.update(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invoiceApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useMarkInvoicePaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invoiceApi.markAsPaid(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useIssueInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invoiceApi.issue(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useVerifyInvoiceIntegrity(id: string) {
  return useQuery({
    queryKey: ["invoice-integrity", id],
    queryFn: () => invoiceApi.verifyIntegrity(id),
    enabled: !!id,
  });
}

export function usePayments(invoiceId: string) {
  return useQuery({
    queryKey: ["payments", invoiceId],
    queryFn: () => paymentApi.getByInvoice(invoiceId),
    enabled: !!invoiceId,
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePaymentInput) => paymentApi.create(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payments", variables.invoice_id] });
      queryClient.invalidateQueries({ queryKey: ["invoices", variables.invoice_id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => paymentApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDuplicateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invoiceApi.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useConvertInvoiceToDeliveryNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invoiceApi.convertToDeliveryNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useCreateInvoiceFromDeliveryNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (deliveryNoteIds: string[]) => invoiceApi.createFromDeliveryNotes(deliveryNoteIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["deliveryNotes"] });
    },
  });
}

export function useBatchDeleteInvoices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => invoiceApi.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
