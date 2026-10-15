import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle, Pencil, Trash2, XCircle } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableNumericCell,
  TableRow,
} from "@/components/ui";
import { locationsApi } from "@/lib/api";
import { useParams, useRouter } from "@/lib/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useAuthStore } from "@/stores/useAuthStore";
import { PurchaseConfirmModal } from "./components/PurchaseConfirmModal";
import {
  usePurchase,
  useConfirmPurchase,
  useCancelPurchase,
  useDeletePurchase,
} from "./hooks/usePurchases";
import { getPaymentBadgeVariant, getStatusBadgeVariant } from "./purchaseStatus";
import type { ConfirmPurchaseOrderInput } from "@/types";

/**
 * The order as it stands, whatever its status — what was ordered, what
 * arrived and at what price — with the actions its status still allows.
 */
export function PurchaseViewPage() {
  const { t } = useTranslation("purchases");
  const { t: tCommon } = useTranslation("common");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const canEdit = useAuthStore((s) => s.hasPermission("purchases", "edit"));
  const canDelete = useAuthStore((s) => s.hasPermission("purchases", "delete"));

  const { data: order, isLoading } = usePurchase(id || "");
  const confirmPurchase = useConfirmPurchase();
  const cancelPurchase = useCancelPurchase();
  const deletePurchase = useDeletePurchase();

  const [receiving, setReceiving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Same rule as the form: the receiving location only means something to a
  // tenant with more than one.
  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: locationsApi.getAll,
  });
  const locationName =
    (locations?.length ?? 0) >= 2
      ? locations?.find((l) => l.id === order?.location_id)?.name ??
        t("fields.defaultLocation")
      : null;

  const guard = (action: () => void) => () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    action();
  };

  const handleConfirm = async (input: ConfirmPurchaseOrderInput) => {
    if (!order) return;
    await confirmPurchase.mutateAsync({ id: order.id, input });
    setReceiving(false);
  };

  const handleCancel = async () => {
    if (!order) return;
    await cancelPurchase.mutateAsync(order.id);
    setCancelling(false);
  };

  const handleDelete = async () => {
    if (!order) return;
    await deletePurchase.mutateAsync(order.id);
    router.push("/purchases");
  };

  if (isLoading || !order) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const isPending = order.status === "PENDING";
  const isReceivable = isPending || order.status === "PARTIALLY_RECEIVED";
  const showReceived = !isPending;
  const lines = order.lines ?? [];
  const lineLabel = (line: (typeof lines)[number]) =>
    `${line.product?.designation ?? line.variant?.name ?? t("fields.product")}${
      line.variant?.name && line.product?.designation ? ` — ${line.variant.name}` : ""
    }`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/purchases")}>
            <ArrowLeft className="h-4 w-4 me-2" />
            {tCommon("buttons.back")}
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-(--color-text-primary)">
                {t("viewPurchase", { number: order.order_number })}
              </h1>
              <Badge variant={getStatusBadgeVariant(order.status)}>
                {t(`status.${order.status}`)}
              </Badge>
              <Badge variant={getPaymentBadgeVariant(order.payment_status)}>
                {t(`paymentStatus.${order.payment_status}`)}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isReceivable && canEdit && (
            <Button size="sm" onClick={guard(() => setReceiving(true))}>
              <CheckCircle className="h-4 w-4 me-2" />
              {t("actions.confirm")}
            </Button>
          )}
          {isPending && canEdit && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/purchases/${order.id}/edit`)}
              >
                <Pencil className="h-4 w-4 me-2" />
                {tCommon("buttons.edit")}
              </Button>
              <Button variant="secondary" size="sm" onClick={guard(() => setCancelling(true))}>
                <XCircle className="h-4 w-4 me-2" />
                {t("actions.cancel")}
              </Button>
            </>
          )}
          {isPending && canDelete && (
            <Button variant="secondary" size="sm" onClick={guard(() => setDeleting(true))}>
              <Trash2 className="h-4 w-4 me-2" />
              {tCommon("buttons.delete")}
            </Button>
          )}
        </div>
      </div>

      {/* Supplier and dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("fields.supplier")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{order.supplier?.name ?? "-"}</p>
            {locationName && (
              <p className="mt-2 text-sm text-(--color-text-secondary)">
                {t("fields.receivingLocation")} : {locationName}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tCommon("dates")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-(--color-text-secondary)">{t("fields.orderDate")}</span>
              <span className="font-medium">{formatDate(order.order_date)}</span>
            </div>
            {order.confirmed_date && (
              <div className="flex justify-between">
                <span className="text-(--color-text-secondary)">{t("fields.receivedDate")}</span>
                <span className="font-medium">{formatDate(order.confirmed_date)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lines */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("fields.lines")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Phone */}
          <div className="md:hidden divide-y divide-(--color-border-primary)">
            {lines.map((line) => {
              const shortReceived = showReceived && line.received_quantity < line.quantity;
              return (
                <div key={line.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-(--color-text-primary)">{lineLabel(line)}</p>
                    <p className="text-xs text-(--color-text-secondary)">
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
                    <p className="text-xs text-(--color-text-secondary)">
                      {t("fields.unitPrice")}: {formatCurrency(line.unit_price)}
                      {" · "}
                      {t("fields.tax")}: {line.tax_rate} %
                    </p>
                  </div>
                  <p className="text-sm font-medium text-(--color-text-primary) shrink-0 tabular-nums">
                    {formatCurrency(line.total)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* From md up */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fields.product")}</TableHead>
                  <TableHead className="text-end">{t("confirmModal.ordered")}</TableHead>
                  {showReceived && (
                    <TableHead className="text-end">{t("confirmModal.receivedQty")}</TableHead>
                  )}
                  <TableHead className="text-end">{t("fields.unitPrice")}</TableHead>
                  <TableHead className="text-end">{t("fields.taxRate")}</TableHead>
                  <TableHead className="text-end">{t("fields.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => {
                  const shortReceived = showReceived && line.received_quantity < line.quantity;
                  return (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">{lineLabel(line)}</TableCell>
                      <TableNumericCell>{line.quantity}</TableNumericCell>
                      {showReceived && (
                        <TableNumericCell
                          className={
                            shortReceived
                              ? "font-medium text-yellow-700 dark:text-yellow-400"
                              : undefined
                          }
                        >
                          {line.received_quantity}
                        </TableNumericCell>
                      )}
                      <TableNumericCell>{formatCurrency(line.unit_price)}</TableNumericCell>
                      <TableNumericCell>{line.tax_rate} %</TableNumericCell>
                      <TableNumericCell className="font-medium">
                        {formatCurrency(line.total)}
                      </TableNumericCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="border-t border-(--color-border-primary) p-4 space-y-1 text-sm sm:ms-auto sm:max-w-xs">
            <div className="flex justify-between text-(--color-text-secondary)">
              <span>{t("fields.subtotal")}</span>
              <span className="tabular-nums">{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-(--color-text-secondary)">
              <span>{t("fields.tax")}</span>
              <span className="tabular-nums">{formatCurrency(order.tax_amount)}</span>
            </div>
            <div className="flex justify-between font-medium text-(--color-text-primary) text-base">
              <span>{t("fields.total")}</span>
              <span className="tabular-nums">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("fields.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-(--color-text-secondary) whitespace-pre-wrap">{order.notes}</p>
          </CardContent>
        </Card>
      )}

      <PurchaseConfirmModal
        key={receiving ? order.id : "closed"}
        open={receiving}
        onClose={() => setReceiving(false)}
        purchaseOrder={order}
        onConfirm={handleConfirm}
        isLoading={confirmPurchase.isPending}
      />

      <Modal
        isOpen={cancelling}
        onClose={() => setCancelling(false)}
        title={t("cancelModal.title")}
        size="sm"
      >
        <p className="text-(--color-text-secondary) mb-6">{t("cancelModal.description")}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setCancelling(false)}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button variant="danger" onClick={handleCancel} isLoading={cancelPurchase.isPending}>
            {t("actions.cancel")}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={deleting}
        onClose={() => setDeleting(false)}
        title={tCommon("messages.confirmDelete")}
        size="sm"
      >
        <p className="text-(--color-text-secondary) mb-6">{t("deleteConfirmation")}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleting(false)}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDelete} isLoading={deletePurchase.isPending}>
            {tCommon("buttons.delete")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
