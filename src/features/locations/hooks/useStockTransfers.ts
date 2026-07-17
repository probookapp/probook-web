import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { stockTransfersApi } from "@/lib/api";

export interface StockTransferLine {
  id?: string;
  product_id: string;
  variant_id?: string | null;
  quantity: number;
}

export interface StockTransfer {
  id: string;
  transfer_number: string;
  from_location: { id: string; name: string } | null;
  to_location: { id: string; name: string } | null;
  lines: StockTransferLine[];
  notes: string | null;
  created_at: string;
}

export interface CreateStockTransferInput {
  from_location_id: string;
  to_location_id: string;
  notes?: string;
  lines: { product_id: string; variant_id?: string | null; quantity: number }[];
}

export function useStockTransfers() {
  return useQuery({
    queryKey: ["stock-transfers"],
    queryFn: async () => {
      const data = await stockTransfersApi.getAll();
      return data as unknown as StockTransfer[];
    },
  });
}

export function useCreateStockTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStockTransferInput) => stockTransfersApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      // Stock levels changed as a result of the transfer.
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
    },
  });
}
