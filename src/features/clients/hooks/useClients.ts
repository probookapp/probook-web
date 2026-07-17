import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_CLIENTS } from "@/lib/demo-data";
import type { CreateClientInput, UpdateClientInput, ClientBalance } from "@/types";

export function useClients() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["clients", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_CLIENTS : clientApi.getAll,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

/**
 * Per-client outstanding balances for the clients list (batch, no N+1).
 * Returns a Map<clientId, balance> for easy lookup. Disabled in demo mode.
 */
export function useClientBalances() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["client-balances", { demo: isDemoMode }],
    queryFn: async (): Promise<Map<string, number>> => {
      const rows: ClientBalance[] = isDemoMode ? [] : await clientApi.getBalances();
      return new Map(rows.map((r) => [r.client_id, r.balance]));
    },
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

/** Client ledger / statement for a date range. Only fetched when enabled (non-demo). */
export function useClientStatement(
  clientId: string | null,
  range: { startDate?: string; endDate?: string }
) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["client-statement", clientId, range],
    queryFn: () => clientApi.getStatement(clientId as string, range),
    enabled: !!clientId && !isDemoMode,
  });
}

export function useClient(id: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["clients", id, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => DEMO_CLIENTS.find((c) => c.id === id) ?? DEMO_CLIENTS[0]
      : () => clientApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateClientInput) => clientApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client-balances"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateClientInput) => clientApi.update(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients", variables.id] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => clientApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client-balances"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useBatchDeleteClients() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => clientApi.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client-balances"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
