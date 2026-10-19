import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableNumericCell,
  TableRow,
} from "@/components/ui";
import { useParams, useRouter } from "@/lib/navigation";
import { formatDate } from "@/lib/utils";
import { useStockTransfer, type StockTransferLine } from "./hooks/useStockTransfers";
import { TRANSFERS_LIST } from "./StockTransferFormPage";

/**
 * A recorded transfer: from where, to where, and what moved. A transfer is
 * final — the stock has already changed on both sides — so there is nothing to
 * edit here, only to read.
 */
export function StockTransferViewPage() {
  const { t } = useTranslation("locations");
  const { t: tCommon } = useTranslation("common");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: transfer, isLoading } = useStockTransfer(id || "");

  if (isLoading || !transfer) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const lineLabel = (line: StockTransferLine) => line.product?.designation ?? "-";
  const totalQuantity = transfer.lines.reduce((sum, l) => sum + Number(l.quantity), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push(TRANSFERS_LIST)}>
          <ArrowLeft className="h-4 w-4 me-2" />
          {tCommon("buttons.back")}
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-(--color-text-primary) break-words">
            {t("transfers.viewTransfer", { number: transfer.transfer_number })}
          </h1>
          <p className="text-sm text-(--color-text-secondary)">{formatDate(transfer.created_at)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("transfers.route")}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* The route is what a transfer is recognised by. */}
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <span className="min-w-0 break-words">{transfer.from_location?.name ?? "-"}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-(--color-text-tertiary)" aria-hidden />
              <span className="min-w-0 break-words">{transfer.to_location?.name ?? "-"}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("transfers.details")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-(--color-text-secondary)">{t("transfers.fields.date")}</span>
              <span className="font-medium">{formatDate(transfer.created_at)}</span>
            </div>
            {transfer.created_by_name && (
              <div className="flex justify-between gap-4">
                <span className="text-(--color-text-secondary)">{t("transfers.fields.createdBy")}</span>
                <span className="font-medium min-w-0 truncate">{transfer.created_by_name}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("transfers.fields.lines")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Phone */}
          <ul className="md:hidden divide-y divide-(--color-border-primary)">
            {transfer.lines.map((line, index) => (
              <li key={line.id ?? index} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-(--color-text-primary) break-words">{lineLabel(line)}</p>
                  {(line.variant?.name || line.product?.reference) && (
                    <p className="text-xs text-(--color-text-secondary) break-words">
                      {[line.variant?.name, line.product?.reference].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <p className="text-sm font-medium text-(--color-text-primary) shrink-0 tabular-nums">
                  {line.quantity}
                </p>
              </li>
            ))}
          </ul>

          {/* From md up */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("transfers.fields.product")}</TableHead>
                  <TableHead>{t("transfers.fields.variant")}</TableHead>
                  <TableHead className="text-end">{t("transfers.fields.quantity")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfer.lines.map((line, index) => (
                  <TableRow key={line.id ?? index}>
                    <TableCell className="font-medium">
                      {lineLabel(line)}
                      {line.product?.reference && (
                        <span className="ms-2 text-xs font-normal text-(--color-text-secondary)">
                          {line.product.reference}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-(--color-text-secondary)">{line.variant?.name ?? "-"}</TableCell>
                    <TableNumericCell>{line.quantity}</TableNumericCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="border-t border-(--color-border-primary) px-4 py-3 flex justify-between text-sm font-medium">
            <span>{t("transfers.totalQuantity")}</span>
            <span className="tabular-nums">{totalQuantity}</span>
          </div>
        </CardContent>
      </Card>

      {transfer.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("transfers.fields.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-(--color-text-secondary) whitespace-pre-wrap break-words">{transfer.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
