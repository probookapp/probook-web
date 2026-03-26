import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientContactApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_CLIENT_CONTACTS } from "@/lib/demo-data";
import type { CreateClientContactInput, UpdateClientContactInput } from "@/types";

export function useClientContacts() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["client-contacts", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_CLIENT_CONTACTS : clientContactApi.getAll,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

export function useClientContactsByClient(clientId: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["client-contacts", "client", clientId],
    queryFn: isDemoMode ? () => [] : () => clientContactApi.getByClientId(clientId),
    enabled: !!clientId,
  });
}

export function useClientContact(id: string) {
  return useQuery({
    queryKey: ["client-contacts", id],
    queryFn: () => clientContactApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateClientContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateClientContactInput) => clientContactApi.create(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["client-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["client-contacts", "client", variables.client_id] });
    },
  });
}

export function useUpdateClientContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateClientContactInput) => clientContactApi.update(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-contacts"] });
    },
  });
}

export function useDeleteClientContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => clientContactApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-contacts"] });
    },
  });
}

export function useSearchContacts(query: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["client-contacts", "search", query, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => DEMO_CLIENT_CONTACTS.filter((c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.email?.toLowerCase().includes(query.toLowerCase()) ||
          c.phone?.includes(query)
        )
      : () => clientContactApi.search(query),
    enabled: query.length >= 2,
  });
}
