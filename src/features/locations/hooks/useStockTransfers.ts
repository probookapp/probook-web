import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { stockTransfersApi } from "@/lib/api";

export interface StockTransferLine {
  id?: string;
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  /** Only on a single transfer (useStockTransfer): what the ids stand for. */
  product?: { id: string; designation: string; reference: string | null } | null;
  variant?: { id: string; name: string } | null;
}

export interface StockTransfer {
  id: string;
  transfer_number: string;
  from_location: { id: string; name: string } | null;
  to_location: { id: string; name: string } | null;
  lines: StockTransferLine[];
  notes: string | null;
  created_at: string;
  /** Only on a single transfer: who recorded it. */
  created_by_name?: string | null;
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

export function useStockTransfer(id: string) {
  return useQuery({
    queryKey: ["stock-transfers", id],
    queryFn: async () => {
      const data = await stockTransfersApi.getById(id);
      return data as unknown as StockTransfer;
    },
    enabled: !!id,
  });
}

export function useCreateStockTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStockTransferInput) =>
      (await stockTransfersApi.create(input)) as unknown as StockTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      // Stock levels changed as a result of the transfer.
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
    },
  });
}
