import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { locationsApi, type Location } from "@/lib/api";

export interface LocationInput {
  name: string;
  type?: string;
  address?: string;
  is_default?: boolean;
}

export function useLocations() {
  return useQuery({
    queryKey: ["locations"],
    queryFn: locationsApi.getAll,
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LocationInput) => locationsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
  });
}

export function useUpdateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string } & Partial<Location>) => locationsApi.update(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
  });
}

export function useDeleteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => locationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
  });
}
