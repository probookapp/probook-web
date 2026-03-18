import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supplierApi, productSupplierApi } from "@/lib/api";
import type { CreateSupplierInput, UpdateSupplierInput, CreateProductSupplierInput } from "@/types";

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: supplierApi.getAll,
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSupplierInput) => supplierApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateSupplierInput) => supplierApi.update(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => supplierApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

export function useSuppliersForProduct(productId: string) {
  return useQuery({
    queryKey: ["suppliers-for-product", productId],
    queryFn: () => productSupplierApi.getSuppliersForProduct(productId),
    enabled: !!productId,
  });
}

export function useProductsForSupplier(supplierId: string) {
  return useQuery({
    queryKey: ["supplier-products", supplierId],
    queryFn: () => productSupplierApi.getProductsForSupplier(supplierId),
    enabled: !!supplierId,
  });
}

export function useAddProductSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductSupplierInput) => productSupplierApi.addLink(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-products"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-for-product"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-supplier-summaries"] });
    },
  });
}

export function useUpdateProductSupplierPrice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ linkId, purchasePrice }: { linkId: string; purchasePrice: number }) =>
      productSupplierApi.updatePrice(linkId, purchasePrice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-products"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-for-product"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-supplier-summaries"] });
    },
  });
}

export function useRemoveProductSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (linkId: string) => productSupplierApi.removeLink(linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-products"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-for-product"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-supplier-summaries"] });
    },
  });
}

export function useBatchDeleteSuppliers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => supplierApi.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}
