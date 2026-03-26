import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productApi } from "@/lib/api";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_PRODUCTS } from "@/lib/demo-data";
import type { CreateProductInput, UpdateProductInput } from "@/types";

export function useProducts() {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["products", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_PRODUCTS : productApi.getAll,
    staleTime: isDemoMode ? Infinity : undefined,
  });
}

export function useProduct(id: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["products", id, { demo: isDemoMode }],
    queryFn: isDemoMode
      ? () => DEMO_PRODUCTS.find((p) => p.id === id) ?? DEMO_PRODUCTS[0]
      : () => productApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductInput) => productApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProductInput) => productApi.update(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products", variables.id] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => productApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useProductPhoto(productId: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ["productPhoto", productId],
    queryFn: isDemoMode ? () => null : () => productApi.getPhotoBase64(productId),
    enabled: !!productId && !isDemoMode,
  });
}

export function useUploadProductPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, file }: { productId: string; file: File }) =>
      productApi.uploadPhoto(productId, file),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["productPhoto", variables.productId] });
      queryClient.invalidateQueries({ queryKey: ["products", variables.productId] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeleteProductPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) => productApi.deletePhoto(productId),
    onSuccess: (_, productId) => {
      queryClient.invalidateQueries({ queryKey: ["productPhoto", productId] });
      queryClient.invalidateQueries({ queryKey: ["products", productId] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useBatchDeleteProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => productApi.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["product-supplier-summaries"] });
    },
  });
}
