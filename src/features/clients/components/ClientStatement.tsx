import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileText } from "lucide-react";
import {
  Button,
  DateInput,
  Modal,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import { type ReportPDFColumn } from "@/features/pdf";
import { exportToCsv } from "@/lib/csv-export";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import { useClientStatement } from "../hooks/useClients";
import type { StatementEntry } from "@/types";

interface ClientStatementProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string | null;
  clientName: string;
}

export function ClientStatement({ isOpen, onClose, clientId, clientName }: ClientStatementProps) {
  const { t } = useTranslation("clients");
  const { t: tCommon } = useTranslation("common");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: statement, isLoading } = useClientStatement(isOpen ? clientId : null, {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const typeLabel = (type: StatementEntry["type"]) =>
    t(`statement.types.${type}`, {
      defaultValue: type,
    });

  const rangeSubtitle = () => {
    const parts = [clientName];
    if (startDate || endDate) {
      parts.push(
        `${t("statement.from")}: ${startDate ? formatDate(startDate) : "-"} — ${t("statement.to")}: ${endDate ? formatDate(endDate) : "-"}`
      );
    }
    return parts.join("  |  ");
  };

  const handleExportCsv = () => {
    if (!statement) return;
    exportToCsv<StatementEntry>(
      statement.entries,
      [
        { header: t("statement.columns.date"), accessor: (e) => formatDate(e.date) },
        { header: t("statement.columns.type"), accessor: (e) => typeLabel(e.type) },
        { header: t("statement.columns.reference"), accessor: (e) => e.reference },
        { header: t("statement.columns.debit"), accessor: (e) => e.debit || "" },
        { header: t("statement.columns.credit"), accessor: (e) => e.credit || "" },
        { header: t("statement.columns.balance"), accessor: (e) => e.running_balance },
      ],
      `statement_${clientName}_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  const handleExportPdf = async () => {
    if (!statement) return;
    const columns: ReportPDFColumn[] = [
      { header: t("statement.columns.date"), flex: 1.2 },
      { header: t("statement.columns.type"), flex: 1.2 },
      { header: t("statement.columns.reference"), flex: 1.5 },
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
        e.reference,
        e.debit ? formatCurrency(e.debit) : "",
        e.credit ? formatCurrency(e.credit) : "",
        formatCurrency(e.running_balance),
      ]),
    ];
    const totals = [
      { label: t("statement.totalInvoiced"), value: formatCurrency(statement.totals.total_invoiced) },
      { label: t("statement.totalPaid"), value: formatCurrency(statement.totals.total_paid) },
      { label: t("statement.totalCredited"), value: formatCurrency(statement.totals.total_credited) },
      { label: t("statement.closingBalance"), value: formatCurrency(statement.totals.closing_balance) },
    ];
    try {
      // Heavy renderer loads on demand — keep @react-pdf/renderer out of the page bundle
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
      link.download = `statement_${clientName}_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("statement.exportError"));
    }
  };

  const hasData = !!statement && statement.entries.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${t("statement.title")} — ${clientName}`} size="xl">
      <div className="space-y-4">
        {/* Date range + exports */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="w-full sm:w-40">
              <DateInput
                name="statement-start"
                label={t("statement.startDate")}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-40">
              <DateInput
                name="statement-end"
                label={t("statement.endDate")}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={!hasData}>
              <Download className="h-4 w-4 mr-2" />
              {tCommon("buttons.exportCsv")}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportPdf} disabled={!hasData}>
              <FileText className="h-4 w-4 mr-2" />
              {t("statement.exportPdf")}
            </Button>
          </div>
        </div>

        {/* Outstanding balance highlight */}
        {statement && (
          <div className="flex items-center justify-between rounded-lg bg-primary-50 dark:bg-primary-900/20 px-4 py-3">
            <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
              {t("statement.outstandingBalance")}
            </span>
            <span className="text-lg font-bold text-primary-700 dark:text-primary-300">
              {formatCurrency(statement.totals.closing_balance)}
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
            <Table className="min-w-150">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("statement.columns.date")}</TableHead>
                  <TableHead>{t("statement.columns.type")}</TableHead>
                  <TableHead>{t("statement.columns.reference")}</TableHead>
                  <TableHead className="text-right">{t("statement.columns.debit")}</TableHead>
                  <TableHead className="text-right">{t("statement.columns.credit")}</TableHead>
                  <TableHead className="text-right">{t("statement.columns.balance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Opening balance row */}
                <TableRow>
                  <TableCell className="text-gray-500 dark:text-gray-400">
                    {startDate ? formatDate(startDate) : "-"}
                  </TableCell>
                  <TableCell />
                  <TableCell className="italic text-gray-500 dark:text-gray-400">
                    {t("statement.openingBalance")}
                  </TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right font-medium">
                    {statement ? formatCurrency(statement.opening_balance) : "-"}
                  </TableCell>
                </TableRow>
                {statement && statement.entries.length > 0 ? (
                  statement.entries.map((e, i) => (
                    <TableRow key={`${e.type}-${e.reference}-${i}`}>
                      <TableCell>{formatDate(e.date)}</TableCell>
                      <TableCell>{typeLabel(e.type)}</TableCell>
                      <TableCell className="font-medium text-gray-900 dark:text-gray-100">{e.reference}</TableCell>
                      <TableCell className="text-right text-gray-600 dark:text-gray-400">
                        {e.debit ? formatCurrency(e.debit) : ""}
                      </TableCell>
                      <TableCell className="text-right text-gray-600 dark:text-gray-400">
                        {e.credit ? formatCurrency(e.credit) : ""}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(e.running_balance)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("statement.noEntries")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Totals */}
        {statement && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("statement.totalInvoiced")}</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(statement.totals.total_invoiced)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("statement.totalPaid")}</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(statement.totals.total_paid)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("statement.totalCredited")}</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(statement.totals.total_credited)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("statement.closingBalance")}</p>
              <p className="font-semibold text-primary-700 dark:text-primary-300">
                {formatCurrency(statement.totals.closing_balance)}
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
