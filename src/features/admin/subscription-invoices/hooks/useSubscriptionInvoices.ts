import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminSubscriptionInvoicesApi } from "@/lib/admin-api";

export function useAdminSubscriptionInvoices(filters?: { status?: string }) {
  return useQuery({
    queryKey: ["admin-subscription-invoices", filters],
    queryFn: () => adminSubscriptionInvoicesApi.getAll(filters),
  });
}

export function useMarkInvoicePaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payment_method }: { id: string; payment_method: string }) =>
      adminSubscriptionInvoicesApi.markPaid(id, { payment_method }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-invoices"] });
    },
  });
}

export function useCreateSubscriptionInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Record<string, unknown>) => adminSubscriptionInvoicesApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-invoices"] });
    },
  });
}

export function useUpdateSubscriptionInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      adminSubscriptionInvoicesApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-invoices"] });
    },
  });
}
