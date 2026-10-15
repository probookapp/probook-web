import type { PurchaseOrderStatus, PurchasePaymentStatus } from "@/types";

/** Badge colour of an order's reception status — the list and the order page agree. */
export function getStatusBadgeVariant(
  status: PurchaseOrderStatus
): "warning" | "success" | "danger" | "info" {
  switch (status) {
    case "PENDING":
      return "warning";
    case "PARTIALLY_RECEIVED":
      return "info";
    case "CONFIRMED":
      return "success";
    case "CANCELLED":
      return "danger";
  }
}

/** Badge colour of an order's payment status. */
export function getPaymentBadgeVariant(
  status: PurchasePaymentStatus
): "danger" | "warning" | "success" {
  switch (status) {
    case "UNPAID":
      return "danger";
    case "PARTIAL":
      return "warning";
    case "PAID":
      return "success";
  }
}
