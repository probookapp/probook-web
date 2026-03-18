import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import i18n from "@/i18n";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        {
          "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200": variant === "default",
          "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300": variant === "success",
          "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300": variant === "warning",
          "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300": variant === "danger",
          "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300": variant === "info",
        },
        className
      )}
      {...props}
    />
  );
}

export function getQuoteStatusVariant(status: string): BadgeProps["variant"] {
  switch (status) {
    case "DRAFT":
      return "default";
    case "SENT":
      return "info";
    case "ACCEPTED":
      return "success";
    case "EXPIRED":
      return "danger";
    default:
      return "default";
  }
}

export function getInvoiceStatusVariant(status: string): BadgeProps["variant"] {
  switch (status) {
    case "DRAFT":
      return "default";
    case "ISSUED":
      return "warning";
    case "PAID":
      return "success";
    default:
      return "default";
  }
}

export function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    DRAFT: "draft",
    SENT: "sent",
    ACCEPTED: "accepted",
    EXPIRED: "expired",
    ISSUED: "issued",
    PAID: "paid",
  };
  const key = statusMap[status];
  return key ? i18n.t(`common:status.${key}`) : status;
}

// Invoice status with due date awareness
export type InvoiceUrgency = "normal" | "due_soon" | "overdue";

export function getInvoiceUrgency(status: string, dueDate: string): InvoiceUrgency {
  if (status !== "ISSUED") return "normal";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "due_soon";
  return "normal";
}

export function getInvoiceStatusVariantWithUrgency(status: string, dueDate: string): BadgeProps["variant"] {
  if (status === "DRAFT") return "default";
  if (status === "PAID") return "success";

  // For ISSUED status, check urgency
  const urgency = getInvoiceUrgency(status, dueDate);
  switch (urgency) {
    case "overdue":
      return "danger";
    case "due_soon":
      return "warning";
    default:
      return "info";
  }
}

export function getInvoiceStatusLabelWithUrgency(status: string, dueDate: string): string {
  if (status !== "ISSUED") return getStatusLabel(status);

  const urgency = getInvoiceUrgency(status, dueDate);
  switch (urgency) {
    case "overdue":
      return i18n.t("common:status.overdue");
    case "due_soon":
      return i18n.t("common:status.dueSoon");
    default:
      return i18n.t("common:status.issued");
  }
}
