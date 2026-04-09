import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import {
  Button,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import { Badge } from "@/components/ui/Badge";
import { supplierCreditApi } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { SupplierPaymentModal } from "./SupplierPaymentModal";
import type { Supplier, SupplierPayment } from "@/types";

interface SupplierCreditsProps {
  supplier: Supplier;
  onClose: () => void;
}

function getPaymentStatusVariant(status: string): "default" | "success" | "warning" | "danger" {
  switch (status) {
    case "PAID":
      return "success";
    case "PARTIAL":
      return "warning";
    case "UNPAID":
      return "danger";
    default:
      return "default";
  }
}

export function SupplierCredits({ supplier, onClose }: SupplierCreditsProps) {
  const { t } = useTranslation("suppliers");
  const { t: tCommon } = useTranslation("common");
  const { isDemoMode, showSubscribePrompt } = useDemoMode();

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const { data: creditSummary, isLoading: isLoadingCredits } = useQuery({
    queryKey: ["supplier-credits", supplier.id],
    queryFn: () => isDemoMode
      ? ({ supplier_id: supplier.id, supplier_name: supplier.name, total_owed: 101150, total_paid: 0, balance: 101150, unpaid_orders: [] } as import("@/types").SupplierCreditSummary)
      : supplierCreditApi.getCredits(supplier.id),
    staleTime: isDemoMode ? Infinity : undefined,
  });

  const { data: payments, isLoading: isLoadingPayments } = useQuery({
    queryKey: ["supplier-payments", supplier.id],
    queryFn: () => isDemoMode ? ([] as SupplierPayment[]) : supplierCreditApi.getPayments(supplier.id),
    staleTime: isDemoMode ? Infinity : undefined,
  });

  if (isLoadingCredits || isLoadingPayments) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
      </div>
    );
  }

  const totalOwed = creditSummary?.total_owed ?? 0;
  const totalPaid = creditSummary?.total_paid ?? 0;
  const balance = creditSummary?.balance ?? 0;
  const unpaidOrders = creditSummary?.unpaid_orders ?? [];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("credits.totalOwed")}</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-1">
            {formatCurrency(totalOwed)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("credits.totalPaid")}</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-1">
            {formatCurrency(totalPaid)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("credits.balance")}</p>
          <p
            className={`text-xl font-semibold mt-1 ${
              balance > 0
                ? "text-red-600 dark:text-red-400"
                : "text-green-600 dark:text-green-400"
            }`}
          >
            {formatCurrency(balance)}
          </p>
          {balance === 0 && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
              {t("credits.noBalance")}
            </p>
          )}
        </div>
      </div>

      {/* Record Payment Button */}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => isDemoMode ? showSubscribePrompt() : setIsPaymentModalOpen(true)}>
          <DollarSign className="h-4 w-4 mr-2" />
          {t("credits.recordPayment")}
        </Button>
      </div>

      {/* Unpaid Purchase Orders */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
          {t("credits.unpaidOrders")}
        </h3>
        <div className="overflow-x-auto">
          <Table className="min-w-full">
            <TableHeader>
              <TableRow>
                <TableHead>{t("credits.orderNumber")}</TableHead>
                <TableHead>{t("credits.orderDate")}</TableHead>
                <TableHead>{t("credits.orderTotal")}</TableHead>
                <TableHead>{t("credits.orderStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unpaidOrders.length > 0 ? (
                unpaidOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                      {order.order_number}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {formatDate(order.order_date)}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {formatCurrency(order.total)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getPaymentStatusVariant(order.payment_status)}>
                        {order.payment_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {t("credits.noUnpaidOrders")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Payment History */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
          {t("credits.paymentHistory")}
        </h3>
        <div className="overflow-x-auto">
          <Table className="min-w-full">
            <TableHeader>
              <TableRow>
                <TableHead>{t("credits.paymentDate")}</TableHead>
                <TableHead>{t("credits.paymentAmount")}</TableHead>
                <TableHead>{t("credits.paymentMethod")}</TableHead>
                <TableHead>{t("credits.paymentReference")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments && payments.length > 0 ? (
                payments.map((payment: SupplierPayment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {formatDate(payment.payment_date)}
                    </TableCell>
                    <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {t(`credits.methods.${payment.payment_method}`, { defaultValue: payment.payment_method })}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {payment.reference || "-"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {t("credits.noPayments")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Payment Modal */}
      <SupplierPaymentModal
        open={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        supplierId={supplier.id}
        unpaidOrders={unpaidOrders}
      />
    </div>
  );
}
