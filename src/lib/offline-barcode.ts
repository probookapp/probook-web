import { QueryClient } from "@tanstack/react-query";
import type { Product } from "@/types";

export function lookupBarcodeOffline(
  queryClient: QueryClient,
  barcode: string
): Product | null {
  const cached = queryClient.getQueryData<Product[]>(["products"]);
  if (!cached) return null;
  return cached.find((p) => p.barcode === barcode) || null;
}
