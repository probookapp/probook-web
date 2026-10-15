import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Modal } from "@/components/ui";
import { locationsApi } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PurchaseOrder } from "@/types";

interface PurchaseDetailModalProps {
  open: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrder | null;
  isLoading?: boolean;
  statusVariant: "warning" | "success" | "danger" | "info";
  paymentVariant: "danger" | "warning" | "success";
}

/**
 * The order as it stands, whatever its status. Edit only exists while an order
 * is pending, so once goods were received there was no way back into it — and
 * that is exactly when someone needs to check what was ordered, what arrived
 * and at what price.
 */
export function PurchaseDetailModal({
  open,
  onClose,
  purchaseOrder,
  isLoading,
  statusVariant,
  paymentVariant,
}: PurchaseDetailModalProps) {
  const { t } = useTranslation("purchases");
  const { t: tCommon } = useTranslation("common");

  // Same rule as the form: the receiving location only means something to a
  // tenant with more than one.
  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: locationsApi.getAll,
    enabled: open,
  });
  const locationName =
    (locations?.length ?? 0) >= 2
      ? locations?.find((l) => l.id === purchaseOrder?.location_id)?.name ??
        t("fields.defaultLocation")
      : null;

  const order = purchaseOrder;
  const lines = order?.lines ?? [];
  const showReceived = !!order && order.status !== "PENDING";

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={order ? t("viewPurchase", { number: order.order_number }) : ""}
      size="lg"
    >
      {isLoading || !order ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : (
        <div className="space-y-6">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">{t("fields.supplier")}</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">
                {order.supplier?.name ?? "-"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">{t("fields.orderDate")}</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">
                {formatDate(order.order_date)}
              </dd>
            </div>
            {order.confirmed_date && (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">{t("fields.receivedDate")}</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">
                  {formatDate(order.confirmed_date)}
                </dd>
              </div>
            )}
            {locationName && (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">{t("fields.receivingLocation")}</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{locationName}</dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500 dark:text-gray-400">{t("fields.status")}</dt>
              <dd className="mt-0.5">
                <Badge variant={statusVariant}>{t(`status.${order.status}`)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">{t("fields.paymentStatus")}</dt>
              <dd className="mt-0.5">
                <Badge variant={paymentVariant}>
                  {t(`paymentStatus.${order.payment_status}`)}
                </Badge>
              </dd>
            </div>
          </dl>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("fields.lines")}
            </h3>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
              {lines.map((line) => {
                const label =
                  line.product?.designation ?? line.variant?.name ?? t("fields.product");
                const shortReceived = showReceived && line.received_quantity < line.quantity;
                return (
                  <div key={line.id} className="p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {label}
                        {line.variant?.name && line.product?.designation
                          ? ` — ${line.variant.name}`
                          : ""}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t("confirmModal.ordered")}: {line.quantity}
                        {showReceived && (
                          <>
                            {" · "}
                            <span
                              className={
                                shortReceived
                                  ? "font-medium text-yellow-700 dark:text-yellow-400"
                                  : undefined
                              }
                            >
                              {t("confirmModal.receivedQty")}: {line.received_quantity}
                            </span>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t("fields.unitPrice")}: {formatCurrency(line.unit_price)}
                        {" · "}
                        {t("fields.tax")}: {line.tax_rate} %
                      </p>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 shrink-0 tabular-nums">
                      {formatCurrency(line.total)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>{t("fields.subtotal")}</span>
              <span className="tabular-nums">{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>{t("fields.tax")}</span>
              <span className="tabular-nums">{formatCurrency(order.tax_amount)}</span>
            </div>
            <div className="flex justify-between font-medium text-gray-900 dark:text-gray-100 text-base">
              <span>{t("fields.total")}</span>
              <span className="tabular-nums">{formatCurrency(order.total)}</span>
            </div>
          </div>

          {order.notes && (
            <div className="text-sm">
              <p className="text-gray-500 dark:text-gray-400">{t("fields.notes")}</p>
              <p className="text-gray-900 dark:text-gray-100 whitespace-pre-line">{order.notes}</p>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              {tCommon("buttons.close")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
