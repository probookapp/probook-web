import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientContactApi } from "@/lib/api";
import type { CreateClientContactInput, UpdateClientContactInput } from "@/types";

export function useClientContacts() {
  return useQuery({
    queryKey: ["client-contacts"],
    queryFn: clientContactApi.getAll,
  });
}

export function useClientContactsByClient(clientId: string) {
  return useQuery({
    queryKey: ["client-contacts", "client", clientId],
    queryFn: () => clientContactApi.getByClientId(clientId),
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
  return useQuery({
    queryKey: ["client-contacts", "search", query],
    queryFn: () => clientContactApi.search(query),
    enabled: query.length >= 2,
  });
}
