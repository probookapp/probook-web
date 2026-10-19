import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, FileText, PackageMinus, Scale } from "lucide-react";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import {
  Button,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableNumericCell,
  FitAmount,
} from "@/components/ui";
import { Badge } from "@/components/ui/Badge";
import { supplierCreditApi } from "@/lib/api";
import { DEMO_PURCHASES } from "@/lib/demo-data";
import { useRouter } from "@/lib/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { SupplierPaymentModal } from "./SupplierPaymentModal";
import { SupplierAdjustmentModal } from "./SupplierAdjustmentModal";
import { SupplierStatement } from "./SupplierStatement";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Supplier, SupplierCreditSummary, SupplierPayment } from "@/types";

interface SupplierCreditsProps {
  supplier: Supplier;
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

/** The demo supplier's account, derived from the demo orders so the two agree. */
function demoSummary(supplier: Supplier): SupplierCreditSummary {
  const orders = DEMO_PURCHASES.filter(
    (o) => o.supplier_id === supplier.id && (o.status === "CONFIRMED" || o.status === "PARTIALLY_RECEIVED")
  );
  const totalOwed = orders.reduce((sum, o) => sum + o.total, 0);
  return {
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    opening_balance: 0,
    total_owed: totalOwed,
    total_adjustments: 0,
    total_paid: 0,
    total_returned: 0,
    balance: totalOwed,
    unpaid_orders: orders.map((o) => ({
      id: o.id,
      order_number: o.order_number,
      order_date: o.order_date,
      status: o.status,
      payment_status: o.payment_status,
      total: o.total,
      amount_settled: 0,
      remaining: o.total,
    })),
  };
}

/**
 * The supplier's account: what was received, what was settled (payments and
 * returns kept as credit), and the balance in either direction. Positive is
 * what the business owes; negative is credit the supplier holds for it.
 */
export function SupplierCredits({ supplier }: SupplierCreditsProps) {
  const { t } = useTranslation("suppliers");
  const { t: tPurchases } = useTranslation("purchases");
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  // Payments and adjustments are gated on the suppliers module (edit); a
  // return is a purchasing document.
  const canEdit = useAuthStore((s) => s.hasPermission("suppliers", "edit"));
  const canReturn = useAuthStore((s) => s.hasPermission("purchases", "create"));

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);

  const { data: creditSummary, isLoading: isLoadingCredits } = useQuery({
    queryKey: ["supplier-credits", supplier.id, { demo: isDemoMode }],
    queryFn: () => (isDemoMode ? demoSummary(supplier) : supplierCreditApi.getCredits(supplier.id)),
    staleTime: isDemoMode ? Infinity : undefined,
  });

  const { data: payments, isLoading: isLoadingPayments } = useQuery({
    queryKey: ["supplier-payments", supplier.id, { demo: isDemoMode }],
    queryFn: () => (isDemoMode ? ([] as SupplierPayment[]) : supplierCreditApi.getPayments(supplier.id)),
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
  const totalReturned = creditSummary?.total_returned ?? 0;
  const openingAndAdjustments =
    (creditSummary?.opening_balance ?? 0) + (creditSummary?.total_adjustments ?? 0);
  const balance = creditSummary?.balance ?? 0;
  const unpaidOrders = creditSummary?.unpaid_orders ?? [];
  // The order's payment status in words: the raw "UNPAID" used to be shown.
  const paymentStatusLabel = (status: string) =>
    tPurchases(`paymentStatus.${status}`, { defaultValue: status });
  const paymentLabel = (payment: SupplierPayment) =>
    payment.from_register
      ? t("credits.fromRegister")
      : t(`credits.methods.${payment.payment_method}`, { defaultValue: payment.payment_method });
  const paymentReference = (payment: SupplierPayment) =>
    payment.reference || payment.purchase_order?.order_number || (payment.purchase_order_id ? "" : t("credits.onAccount"));

  const guard = (action: () => void) => () => (isDemoMode ? showSubscribePrompt() : action());

  const balanceTone =
    balance > 0.005
      ? "text-red-600 dark:text-red-400"
      : balance < -0.005
        ? "text-green-600 dark:text-green-400"
        : "text-(--color-text-primary)";
  const balanceCaption =
    balance > 0.005 ? t("credits.youOwe") : balance < -0.005 ? t("credits.inYourFavour") : t("credits.settledUp");

  return (
    <div className="@container space-y-6">
      {/* Summary Cards. Columns follow the modal's width, not the screen's: the
          modal is far narrower than a desktop viewport, and three tiles in it
          left each total about 110 px. */}
      <div className="grid grid-cols-1 @lg:grid-cols-3 gap-4">
        <div className="min-w-0 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("credits.totalOwed")}</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-1">
            <FitAmount>{formatCurrency(totalOwed)}</FitAmount>
          </p>
          {Math.abs(openingAndAdjustments) >= 0.005 && (
            <p className="text-xs text-(--color-text-secondary) mt-0.5 wrap-anywhere">
              {t("credits.openingAndAdjustments", { amount: formatCurrency(openingAndAdjustments) })}
            </p>
          )}
        </div>
        <div className="min-w-0 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("credits.settled")}</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-1">
            <FitAmount>{formatCurrency(totalPaid + totalReturned)}</FitAmount>
          </p>
          {totalReturned > 0 && (
            <p className="text-xs text-(--color-text-secondary) mt-0.5 wrap-anywhere">
              {t("credits.settledDetail", { amount: formatCurrency(totalReturned) })}
            </p>
          )}
        </div>
        <div className="min-w-0 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("credits.balance")}</p>
          <p className={`text-xl font-semibold mt-1 ${balanceTone}`}>
            <FitAmount>{formatCurrency(Math.abs(balance))}</FitAmount>
          </p>
          <p className={`text-xs mt-0.5 ${balanceTone}`}>{balanceCaption}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={guard(() => setIsStatementOpen(true))}>
          <FileText className="h-4 w-4 me-2" />
          {t("credits.viewStatement")}
        </Button>
        {canReturn && (
          <Button
            variant="secondary"
            size="sm"
            onClick={guard(() => router.push(`/purchases/returns/new?supplier=${supplier.id}`))}
          >
            <PackageMinus className="h-4 w-4 me-2" />
            {t("credits.returnGoods")}
          </Button>
        )}
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={guard(() => setIsAdjustmentOpen(true))}>
            <Scale className="h-4 w-4 me-2" />
            {t("credits.adjust")}
          </Button>
        )}
        {canEdit && (
          <Button size="sm" onClick={guard(() => setIsPaymentModalOpen(true))}>
            <DollarSign className="h-4 w-4 me-2" />
            {t("credits.recordPayment")}
          </Button>
        )}
      </div>

      {/* Unpaid Purchase Orders */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
          {t("credits.unpaidOrders")}
        </h3>
        {/* Cards while the dialog is narrow (a phone), the table once it is
            wide enough — measured on the dialog (@container above). */}
        <ul className="@md:hidden divide-y divide-(--color-border-primary) rounded-lg border border-(--color-border-primary)">
          {unpaidOrders.length > 0 ? (
            unpaidOrders.map((order) => (
              <li key={order.id} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-(--color-text-primary) wrap-anywhere">{order.order_number}</p>
                  <p className="text-xs text-(--color-text-secondary)">{formatDate(order.order_date)}</p>
                  <div className="mt-1">
                    <Badge variant={getPaymentStatusVariant(order.payment_status)}>
                      {paymentStatusLabel(order.payment_status)}
                    </Badge>
                  </div>
                </div>
                <div className="min-w-0 flex-1 text-end">
                  <FitAmount className="text-sm font-medium">{formatCurrency(order.remaining)}</FitAmount>
                  <p className="text-xs text-(--color-text-secondary)">{t("credits.remaining")}</p>
                </div>
              </li>
            ))
          ) : (
            <li className="px-3 py-6 text-center text-sm text-(--color-text-secondary)">{t("credits.noUnpaidOrders")}</li>
          )}
        </ul>
        <div className="hidden @md:block overflow-x-auto">
          <Table className="min-w-full">
            <TableHeader>
              <TableRow>
                <TableHead>{t("credits.orderNumber")}</TableHead>
                <TableHead>{t("credits.orderDate")}</TableHead>
                <TableHead className="text-end">{t("credits.orderTotal")}</TableHead>
                <TableHead className="text-end">{t("credits.remaining")}</TableHead>
                <TableHead>{t("credits.orderStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unpaidOrders.length > 0 ? (
                unpaidOrders.map((order) => (
                  <TableRow key={order.id} onActivate={() => router.push(`/purchases/${order.id}`)}>
                    <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                      {order.order_number}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {formatDate(order.order_date)}
                    </TableCell>
                    <TableNumericCell className="text-gray-600 dark:text-gray-400">
                      {formatCurrency(order.total)}
                    </TableNumericCell>
                    <TableNumericCell className="font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(order.remaining)}
                    </TableNumericCell>
                    <TableCell>
                      <Badge variant={getPaymentStatusVariant(order.payment_status)}>
                        {paymentStatusLabel(order.payment_status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500 dark:text-gray-400 py-8">
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
        <ul className="@md:hidden divide-y divide-(--color-border-primary) rounded-lg border border-(--color-border-primary)">
          {payments && payments.length > 0 ? (
            payments.map((payment: SupplierPayment) => (
              <li key={payment.id} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1 wrap-anywhere">
                  <p className="text-sm text-(--color-text-primary)">{formatDate(payment.payment_date)}</p>
                  <p className="text-xs text-(--color-text-secondary)">
                    {paymentLabel(payment)}
                    {paymentReference(payment) ? ` · ${paymentReference(payment)}` : ""}
                  </p>
                </div>
                <FitAmount className="min-w-0 flex-1 text-end text-sm font-medium">{formatCurrency(payment.amount)}</FitAmount>
              </li>
            ))
          ) : (
            <li className="px-3 py-6 text-center text-sm text-(--color-text-secondary)">{t("credits.noPayments")}</li>
          )}
        </ul>
        <div className="hidden @md:block overflow-x-auto">
          <Table className="min-w-full">
            <TableHeader>
              <TableRow>
                <TableHead>{t("credits.paymentDate")}</TableHead>
                <TableHead className="text-end">{t("credits.paymentAmount")}</TableHead>
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
                    <TableNumericCell className="font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(payment.amount)}
                    </TableNumericCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {paymentLabel(payment)}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {paymentReference(payment) || "-"}
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

      <SupplierPaymentModal
        open={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        supplierId={supplier.id}
        unpaidOrders={unpaidOrders}
      />
      <SupplierAdjustmentModal
        open={isAdjustmentOpen}
        onClose={() => setIsAdjustmentOpen(false)}
        supplierId={supplier.id}
      />
      <SupplierStatement
        isOpen={isStatementOpen}
        onClose={() => setIsStatementOpen(false)}
        supplierId={supplier.id}
        supplierName={supplier.name}
      />
    </div>
  );
}
