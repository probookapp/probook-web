import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Trash2 } from "lucide-react";
import {
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
import { useParams, useRouter } from "@/lib/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSupplierReturn, useDeleteSupplierReturn } from "./hooks/useSupplierReturns";

/** One return to a supplier: what went back, from where, and what it is worth. */
export function SupplierReturnViewPage() {
  const { t } = useTranslation("purchases");
  const { t: tCommon } = useTranslation("common");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const canDelete = useAuthStore((s) => s.hasPermission("purchases", "delete"));
  const { data: ret, isLoading } = useSupplierReturn(id || "");
  const deleteReturn = useDeleteSupplierReturn();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!ret) return;
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      await deleteReturn.mutateAsync(ret.id);
      router.push("/purchases/returns");
    } catch {
      // Toasted by the mutation.
    }
  };

  if (isLoading || !ret) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const lines = ret.lines ?? [];
  const lineLabel = (line: (typeof lines)[number]) =>
    `${line.product?.designation ?? line.variant?.name ?? t("fields.product")}${
      line.variant?.name && line.product?.designation ? ` — ${line.variant.name}` : ""
    }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/purchases/returns")}>
            <ArrowLeft className="h-4 w-4 me-2" />
            {tCommon("buttons.back")}
          </Button>
          <h1 className="min-w-0 text-xl sm:text-2xl font-bold text-(--color-text-primary) wrap-anywhere">
            {t("returns.viewReturn", { number: ret.return_number })}
          </h1>
        </div>
        {canDelete && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDeleting(true)}>
              <Trash2 className="h-4 w-4 me-2" />
              {t("returns.deleteTitle")}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("fields.supplier")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-medium wrap-anywhere">{ret.supplier?.name ?? "-"}</p>
            {ret.purchase_order && (
              <p className="text-sm text-(--color-text-secondary)">
                {t("returns.fromOrder")} :{" "}
                <button
                  type="button"
                  className="font-medium text-primary-600 hover:underline dark:text-primary-400"
                  onClick={() => router.push(`/purchases/${ret.purchase_order!.id}`)}
                >
                  {ret.purchase_order.order_number}
                </button>
              </p>
            )}
            {ret.location && (
              <p className="text-sm text-(--color-text-secondary) wrap-anywhere">
                {t("returns.location")} : {ret.location.name}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tCommon("dates")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between gap-4">
              <span className="text-(--color-text-secondary)">{t("returns.date")}</span>
              <span className="font-medium">{formatDate(ret.return_date)}</span>
            </div>
            {ret.reason && (
              <div className="flex justify-between gap-4">
                <span className="shrink-0 text-(--color-text-secondary)">{t("returns.reason")}</span>
                <span className="font-medium text-end wrap-anywhere">{ret.reason}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("returns.lines")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="md:hidden divide-y divide-(--color-border-primary)">
            {lines.map((line) => (
              <div key={line.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-(--color-text-primary) wrap-anywhere">{lineLabel(line)}</p>
                  <p className="text-xs text-(--color-text-secondary)">
                    {t("fields.quantity")}: {line.quantity} · {formatCurrency(line.unit_price)} · {line.tax_rate} %
                  </p>
                </div>
                <p className="text-sm font-medium text-(--color-text-primary) shrink-0 tabular-nums">
                  {formatCurrency(line.total)}
                </p>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fields.product")}</TableHead>
                  <TableHead className="text-end">{t("fields.quantity")}</TableHead>
                  <TableHead className="text-end">{t("fields.unitPrice")}</TableHead>
                  <TableHead className="text-end">{t("fields.taxRate")}</TableHead>
                  <TableHead className="text-end">{t("fields.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">{lineLabel(line)}</TableCell>
                    <TableNumericCell>{line.quantity}</TableNumericCell>
                    <TableNumericCell>{formatCurrency(line.unit_price)}</TableNumericCell>
                    <TableNumericCell>{line.tax_rate} %</TableNumericCell>
                    <TableNumericCell className="font-medium">{formatCurrency(line.total)}</TableNumericCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t border-(--color-border-primary) p-4 space-y-1 text-sm sm:ms-auto sm:max-w-xs">
            <div className="flex justify-between text-(--color-text-secondary)">
              <span>{t("fields.subtotal")}</span>
              <span className="tabular-nums">{formatCurrency(ret.subtotal)}</span>
            </div>
            <div className="flex justify-between text-(--color-text-secondary)">
              <span>{t("fields.tax")}</span>
              <span className="tabular-nums">{formatCurrency(ret.tax_amount)}</span>
            </div>
            <div className="flex justify-between font-medium text-(--color-text-primary) text-base">
              <span>{t("fields.total")}</span>
              <span className="tabular-nums">{formatCurrency(ret.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {ret.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("fields.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-(--color-text-secondary) whitespace-pre-wrap wrap-anywhere">{ret.notes}</p>
          </CardContent>
        </Card>
      )}

      <Modal isOpen={deleting} onClose={() => setDeleting(false)} title={t("returns.deleteTitle")} size="sm">
        <p className="text-(--color-text-secondary) mb-6 wrap-anywhere">{t("returns.confirmDelete")}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleting(false)}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDelete} isLoading={deleteReturn.isPending}>
            {t("returns.deleteTitle")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
