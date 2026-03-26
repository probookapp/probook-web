import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productCategoryApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import type { CreateProductCategoryInput, UpdateProductCategoryInput } from "@/types";

export function useProductCategories() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["productCategories", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => [] : productCategoryApi.getAll,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

export function useProductCategory(id: string) {
  return useQuery({
    queryKey: ["productCategories", id],
    queryFn: () => productCategoryApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateProductCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductCategoryInput) => productCategoryApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productCategories"] });
    },
  });
}

export function useUpdateProductCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProductCategoryInput) => productCategoryApi.update(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["productCategories"] });
      queryClient.invalidateQueries({ queryKey: ["productCategories", variables.id] });
    },
  });
}

export function useDeleteProductCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => productCategoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productCategories"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
