import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import i18n from "@/i18n";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info";
}

/**
 * A tint plus a hairline of the same hue, not a pill. A fully rounded capsule
 * reads as a tag — something you attached; a squared chip reads as a state —
 * something the document is. These say what a document is.
 */
const BADGE_VARIANTS = {
  default:
    "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  success:
    "bg-success-50 text-success-700 border-success-200 dark:bg-success-950 dark:text-success-300 dark:border-success-800",
  warning:
    "bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-950 dark:text-warning-300 dark:border-warning-800",
  danger:
    "bg-danger-50 text-danger-700 border-danger-200 dark:bg-danger-950 dark:text-danger-300 dark:border-danger-800",
  info: "bg-info-50 text-info-700 border-info-200 dark:bg-info-950 dark:text-info-300 dark:border-info-800",
} as const;

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        BADGE_VARIANTS[variant],
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
