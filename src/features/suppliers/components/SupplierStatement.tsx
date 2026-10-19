import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileText, Trash2 } from "lucide-react";
import {
  Button,
  DateInput,
  Modal,
  FitAmount,
} from "@/components/ui";
import { type ReportPDFColumn } from "@/features/pdf";
import { exportToCsv } from "@/lib/csv-export";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDeleteSupplierAdjustment, useSupplierStatement } from "../hooks/useSupplierAccount";
import type { SupplierStatementEntry } from "@/types";

interface SupplierStatementProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: string | null;
  supplierName: string;
}

/**
 * The supplier's account line by line, the mirror of the client statement.
 * "Owed" adds to the debt (orders received, an opening balance owed, an
 * adjustment up); "Settled" takes it off (payments, returns, an adjustment
 * down). The running balance below zero is credit the supplier holds.
 */
export function SupplierStatement({ isOpen, onClose, supplierId, supplierName }: SupplierStatementProps) {
  const { t } = useTranslation("suppliers");
  const { t: tCommon } = useTranslation("common");
  const canEdit = useAuthStore((s) => s.hasPermission("suppliers", "edit"));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteAdjustment = useDeleteSupplierAdjustment(supplierId ?? "");

  const { data: statement, isLoading } = useSupplierStatement(isOpen ? supplierId : null, {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const typeLabel = (type: SupplierStatementEntry["type"]) =>
    t(`statement.types.${type}`, { defaultValue: type });
  /** Reference and the free text beside it (an adjustment's reason, a return's motive). */
  const describe = (e: SupplierStatementEntry) => [e.reference, e.label].filter(Boolean).join(" · ");

  const rangeSubtitle = () => {
    const parts = [supplierName];
    if (startDate || endDate) {
      parts.push(
        `${t("statement.from")}: ${startDate ? formatDate(startDate) : "-"}  ${t("statement.to")}: ${endDate ? formatDate(endDate) : "-"}`
      );
    }
    return parts.join("  |  ");
  };

  const fileStem = `supplier_statement_${supplierName}_${new Date().toISOString().split("T")[0]}`;

  const handleExportCsv = () => {
    if (!statement) return;
    exportToCsv<SupplierStatementEntry>(
      statement.entries,
      [
        { header: t("statement.columns.date"), accessor: (e) => formatDate(e.date) },
        { header: t("statement.columns.type"), accessor: (e) => typeLabel(e.type) },
        { header: t("statement.columns.reference"), accessor: (e) => describe(e) },
        { header: t("statement.columns.debit"), accessor: (e) => e.debit || "" },
        { header: t("statement.columns.credit"), accessor: (e) => e.credit || "" },
        { header: t("statement.columns.balance"), accessor: (e) => e.running_balance },
      ],
      `${fileStem}.csv`
    );
  };

  const handleExportPdf = async () => {
    if (!statement) return;
    const columns: ReportPDFColumn[] = [
      { header: t("statement.columns.date"), flex: 1.2 },
      { header: t("statement.columns.type"), flex: 1.2 },
      { header: t("statement.columns.reference"), flex: 1.8 },
      { header: t("statement.columns.debit"), align: "right", flex: 1.2 },
      { header: t("statement.columns.credit"), align: "right", flex: 1.2 },
      { header: t("statement.columns.balance"), align: "right", flex: 1.3 },
    ];
    const rows: string[][] = [
      [
        formatDate(startDate || statement.entries[0]?.date || null),
        "",
        t("statement.openingBalance"),
        "",
        "",
        formatCurrency(statement.opening_balance),
      ],
      ...statement.entries.map((e) => [
        formatDate(e.date),
        typeLabel(e.type),
        describe(e),
        e.debit ? formatCurrency(e.debit) : "",
        e.credit ? formatCurrency(e.credit) : "",
        formatCurrency(e.running_balance),
      ]),
    ];
    const totals = [
      { label: t("statement.totalDebit"), value: formatCurrency(statement.totals.total_debit) },
      { label: t("statement.totalCredit"), value: formatCurrency(statement.totals.total_credit) },
      { label: t("statement.closingBalance"), value: formatCurrency(statement.totals.closing_balance) },
    ];
    try {
      // Heavy renderer loads on demand: keep @react-pdf/renderer out of the page bundle.
      const [{ pdf }, { ReportPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/features/pdf/ReportPDF"),
      ]);
      const blob = await pdf(
        <ReportPDF title={t("statement.title")} subtitle={rangeSubtitle()} columns={columns} rows={rows} totals={totals} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileStem}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("statement.exportError"));
    }
  };

  const handleDeleteAdjustment = async () => {
    if (!deletingId) return;
    try {
      await deleteAdjustment.mutateAsync(deletingId);
      setDeletingId(null);
    } catch {
      // Toasted by the mutation.
    }
  };

  const hasData = !!statement && statement.entries.length > 0;
  const canDeleteEntry = (e: SupplierStatementEntry) => canEdit && e.type === "adjustment" && !!e.record_id;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${t("statement.title")} : ${supplierName}`} size="xl">
      <div className="space-y-4">
        {/* Date range + exports */}
        {/* Wraps rather than overflows: two dates and two exports do not fit
            one line of a dialog this wide. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="w-full sm:w-40">
              <DateInput
                name="supplier-statement-start"
                label={t("statement.startDate")}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-40">
              <DateInput
                name="supplier-statement-end"
                label={t("statement.endDate")}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={!hasData}>
              <Download className="h-4 w-4 me-2" />
              {tCommon("buttons.exportCsv")}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportPdf} disabled={!hasData}>
              <FileText className="h-4 w-4 me-2" />
              {t("statement.exportPdf")}
            </Button>
          </div>
        </div>

        {statement && (
          <div className="flex items-center justify-between gap-4 rounded-lg bg-primary-50 dark:bg-primary-900/20 px-4 py-3">
            <span className="shrink-0 text-sm font-medium text-primary-700 dark:text-primary-300">
              {statement.totals.closing_balance < -0.005 ? t("credits.inYourFavour") : t("credits.youOwe")}
            </span>
            <FitAmount
              className={`flex-1 text-end text-lg font-bold ${
                statement.totals.closing_balance < -0.005
                  ? "text-green-600 dark:text-green-400"
                  : statement.totals.closing_balance > 0.005
                    ? "text-red-600 dark:text-red-400"
                    : "text-primary-700 dark:text-primary-300"
              }`}
            >
              {formatCurrency(Math.abs(statement.totals.closing_balance))}
            </FitAmount>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          // One card per line at every width. A table of five amounts did
          // not fit this dialog even on a desktop: the running balance, the
          // figure looked for, ended up out of sight.
          <div>
            <ul className="max-h-[50vh] overflow-y-auto divide-y divide-(--color-border-primary) rounded-lg border border-(--color-border-primary)">
              <li className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm italic text-(--color-text-secondary)">{t("statement.openingBalance")}</p>
                  <p className="text-xs text-(--color-text-tertiary)">{startDate ? formatDate(startDate) : "-"}</p>
                </div>
                <FitAmount className="min-w-0 flex-1 text-end text-sm font-medium">
                  {statement ? formatCurrency(statement.opening_balance) : "-"}
                </FitAmount>
              </li>
              {statement && statement.entries.length > 0 ? (
                statement.entries.map((e, i) => (
                  <li key={`${e.type}-${e.record_id ?? e.reference}-${i}`} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-(--color-text-primary) wrap-anywhere">
                        {describe(e) || typeLabel(e.type)}
                      </p>
                      <p className="text-xs text-(--color-text-secondary)">
                        {formatDate(e.date)} · {typeLabel(e.type)}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1 text-end">
                      <FitAmount className="text-sm text-(--color-text-secondary)">
                        {e.debit ? `+ ${formatCurrency(e.debit)}` : e.credit ? `− ${formatCurrency(e.credit)}` : ""}
                      </FitAmount>
                      <FitAmount className="text-sm font-medium">{formatCurrency(e.running_balance)}</FitAmount>
                    </div>
                    {canDeleteEntry(e) && (
                      <button
                        type="button"
                        onClick={() => setDeletingId(e.record_id)}
                        aria-label={t("adjustment.deleteTitle")}
                        title={t("adjustment.deleteTitle")}
                        className="-me-1 rounded-lg p-2 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))
              ) : (
                <li className="px-3 py-6 text-center text-sm text-(--color-text-secondary)">{t("statement.noEntries")}</li>
              )}
            </ul>
          </div>
        )}

        {statement && (
          <div className="@container border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="grid grid-cols-1 @md:grid-cols-3 gap-3">
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("statement.totalDebit")}</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  <FitAmount>{formatCurrency(statement.totals.total_debit)}</FitAmount>
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("statement.totalCredit")}</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  <FitAmount>{formatCurrency(statement.totals.total_credit)}</FitAmount>
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("statement.closingBalance")}</p>
                <p className="font-semibold text-primary-700 dark:text-primary-300">
                  <FitAmount>{formatCurrency(statement.totals.closing_balance)}</FitAmount>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        title={t("adjustment.deleteTitle")}
        size="sm"
      >
        <p className="text-(--color-text-secondary) mb-6 wrap-anywhere">{t("adjustment.deleteConfirm")}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeletingId(null)}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button variant="danger" onClick={handleDeleteAdjustment} isLoading={deleteAdjustment.isPending}>
            {tCommon("buttons.delete")}
          </Button>
        </div>
      </Modal>
    </Modal>
  );
}
