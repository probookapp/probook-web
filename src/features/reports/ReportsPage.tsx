import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/stores/useToastStore";
import {
  BarChart3,
  Users,
  Package,
  AlertCircle,
  AlertTriangle,
  Boxes,
  TrendingUp,
  Download,
  FileDown,
  Calendar,
  Calculator,
  Receipt,
  DollarSign,
  Truck,
  Activity,
  Percent,
  PieChart,
  FileSpreadsheet,
  FileText,
  SlidersHorizontal,
  RotateCcw,
  Wallet,
  Settings2,
} from "lucide-react";
import { CashJournalOpeningModal } from "./components/CashJournalOpeningModal";
import { paymentMethodLabelKey } from "@/lib/payment-methods";
import { useAuthStore } from "@/stores/useAuthStore";
import type { MoneyBucketKey } from "@/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  DateInput,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableNumericCell,
  Badge,
  PageHeader,
  ColumnPicker,
  FitAmount,
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuCheckboxItem,
  MenuSeparator,
  MenuLabel,
} from "@/components/ui";
import { useTableColumns, type TableColumnsState } from "@/hooks/useTableColumns";
import { useRouter } from "@/lib/navigation";
import type { ReportPDFColumn } from "@/features/pdf/ReportPDF";
import { formatCurrency, formatDate } from "@/lib/utils";
import { locationsApi } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import { claimDownloadTab, deliverPdf } from "@/features/pdf/pdf-delivery";
import { useLowStock } from "@/features/products/hooks/useStock";
import {
  useRevenueByMonth,
  useRevenueByClient,
  useProductSales,
  useOutstandingPayments,
  useQuoteConversionStats,
  useExpensesReport,
  useProfitMargin,
  useInvoiceMargin,
  useCashJournal,
  useSupplierSpend,
  useInventoryValuation,
  usePosDailyReport,
  useTaxSummary,
  useAccountingExport,
  useExpensesByCategory,
  usePipelineReport,
} from "./hooks/useReports";

type ReportType =
  | "pipeline"
  | "revenue"
  | "clients"
  | "products"
  | "profitMargin"
  | "invoiceMargin"
  | "cashJournal"
  | "supplierSpend"
  | "outstanding"
  | "conversion"
  | "posDaily"
  | "expenses"
  | "expensesByCategory"
  | "lowStock"
  | "inventoryValuation"
  | "taxSummary"
  | "accountingExport";

/**
 * Lightweight, dependency-free bar chart (theme-aware). Matches the div-based
 * approach used by the admin dashboard.
 */
function SimpleBarChart({
  data,
  caption,
  formatValue,
}: {
  data: { label: string; value: number }[];
  caption: string;
  formatValue: (v: number) => string;
}) {
  const { t } = useTranslation(["reports"]);

  if (!data || data.length === 0) {
    return (
      <p className="text-(--color-text-secondary) text-center py-4">
        {t("reports:noData")}
      </p>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-(--color-text-secondary) mb-3">
        {caption}
      </p>
      <div className="flex items-end gap-1 h-40">
        {data.map((entry, i) => {
          const heightPct = Math.max((entry.value / maxVal) * 100, 2);
          const displayVal = formatValue(entry.value);
          return (
            <div
              key={`${entry.label}-${i}`}
              className="flex-1 flex flex-col items-center gap-1 min-w-0"
            >
              <span className="text-[10px] text-(--color-text-secondary) truncate max-w-full">
                {displayVal}
              </span>
              <div
                className="w-full bg-primary-500 dark:bg-primary-400 rounded-t transition-all"
                style={{ height: `${heightPct}%` }}
                title={`${entry.label}: ${displayVal}`}
              />
              <span className="text-[10px] text-(--color-text-secondary) truncate max-w-full">
                {entry.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** CSV + PDF export toolbar shared by every report tab. */
function ExportBar({
  onCsv,
  onPdf,
  columns,
}: {
  onCsv: () => void;
  onPdf: () => void;
  /** The tab's column picker, for the tables wide enough to need one. */
  columns?: TableColumnsState;
}) {
  const { t } = useTranslation(["reports"]);
  return (
    <div className="flex justify-end gap-2">
      {columns && <ColumnPicker columns={columns} />}
      <Button variant="secondary" size="sm" onClick={onPdf}>
        <FileDown className="h-4 w-4 me-2" />
        {t("reports:exportPdf")}
      </Button>
      <Button variant="secondary" size="sm" onClick={onCsv}>
        <Download className="h-4 w-4 me-2" />
        {t("reports:exportCsv")}
      </Button>
    </div>
  );
}

/**
 * "Customize" — tick the reports the tab bar shows. Saved to the account like a
 * list's columns, so a shop that never uses the till or the stock reports does
 * not wade through them. One report always stays: an empty bar is a dead end.
 */
function ReportTabsPicker({ tabs }: { tabs: TableColumnsState }) {
  const { t } = useTranslation(["reports"]);
  const visibleCount = tabs.options.filter((o) => o.visible).length;
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <Button variant="ghost" size="sm" className="whitespace-nowrap">
          <SlidersHorizontal className="h-4 w-4" />
          {t("reports:tabs.customize")}
          {tabs.hiddenCount > 0 && (
            <span className="ms-0.5 rounded-full bg-(--color-bg-tertiary) px-1.5 text-xs tabular-nums text-(--color-text-secondary)">
              {tabs.hiddenCount}
            </span>
          )}
        </Button>
      </MenuTrigger>
      {/* Sixteen reports outgrow a laptop screen: the list scrolls inside the
          room Radix measures below the trigger instead of running off the page. */}
      <MenuContent align="end" className="min-w-60 max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto">
        <MenuLabel>{t("reports:tabs.title")}</MenuLabel>
        {tabs.options.map((option) => (
          <MenuCheckboxItem
            key={option.key}
            checked={option.visible}
            disabled={option.visible && visibleCount <= 1}
            // Stay open: people untick several reports, not one.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => tabs.toggle(option.key)}
          >
            {option.label}
          </MenuCheckboxItem>
        ))}
        {tabs.hiddenCount > 0 && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={tabs.reset}>
              <RotateCcw className="h-4 w-4 opacity-70" />
              {t("reports:tabs.showAll")}
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

export function ReportsPage() {
  const { t } = useTranslation(["reports", "common", "pos"]);
  const [selectedReport, setActiveReport] = useState<ReportType>("revenue");

  const reports = [
    { id: "pipeline" as const, label: t("reports:pipeline.title"), icon: Activity },
    { id: "revenue" as const, label: t("reports:revenueByPeriod.title"), icon: BarChart3 },
    { id: "clients" as const, label: t("reports:revenueByClient.title"), icon: Users },
    { id: "products" as const, label: t("reports:productSales.title"), icon: Package },
    { id: "profitMargin" as const, label: t("reports:profitMargin.title"), icon: DollarSign },
    { id: "invoiceMargin" as const, label: t("reports:invoiceMargin.title"), icon: FileText },
    { id: "cashJournal" as const, label: t("reports:cashJournal.title"), icon: Wallet },
    { id: "supplierSpend" as const, label: t("reports:supplierSpend.title"), icon: Truck },
    { id: "outstanding" as const, label: t("reports:outstanding.title"), icon: AlertCircle },
    { id: "conversion" as const, label: t("reports:quoteConversion.title"), icon: TrendingUp },
    { id: "posDaily" as const, label: t("reports:posDaily.title"), icon: Calculator },
    { id: "expenses" as const, label: t("reports:expenses.title"), icon: Receipt },
    { id: "expensesByCategory" as const, label: t("reports:expensesByCategory.title"), icon: PieChart },
    { id: "lowStock" as const, label: t("reports:lowStock.title"), icon: AlertTriangle },
    { id: "inventoryValuation" as const, label: t("reports:inventoryValuation.title"), icon: Boxes },
    { id: "taxSummary" as const, label: t("reports:taxSummary.title"), icon: Percent },
    { id: "accountingExport" as const, label: t("reports:accountingExport.title"), icon: FileSpreadsheet },
  ];
  // Which reports the bar shows: the same saved preference as a list's columns.
  const reportTabs = useTableColumns(
    "report-tabs",
    reports.map((r) => ({ key: r.id, label: r.label }))
  );
  const visibleReports = reports.filter((r) => reportTabs.show(r.id));
  // A report the person has just hidden is not left open behind the bar.
  const activeReport: ReportType = visibleReports.some((r) => r.id === selectedReport)
    ? selectedReport
    : (visibleReports[0]?.id ?? selectedReport);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 12);
    return date.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [posDate, setPosDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [reportLocation, setReportLocation] = useState<string>("");

  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: locationsApi.getAll,
  });
  // Per-location filtering is only exposed once the tenant has 2+ locations.
  const multiLocation = (locations?.length ?? 0) >= 2;
  const locationFilter = multiLocation && reportLocation ? reportLocation : undefined;

  // Each report query is gated on its tab being visible so switching tabs (or
  // changing the date range) only fetches the active report, not all of them.
  const { data: revenueData, isPending: isLoadingRevenue } = useRevenueByMonth(
    startDate,
    endDate,
    activeReport === "revenue"
  );
  const { data: clientData, isPending: isLoadingClients } = useRevenueByClient(
    startDate,
    endDate,
    activeReport === "clients"
  );
  const { data: productData, isPending: isLoadingProducts } = useProductSales(
    startDate,
    endDate,
    activeReport === "products"
  );
  const { data: profitData, isPending: isLoadingProfit } = useProfitMargin(
    startDate,
    endDate,
    activeReport === "profitMargin"
  );
  const { data: cashJournalData, isPending: isLoadingCashJournal } = useCashJournal(
    startDate,
    endDate,
    activeReport === "cashJournal"
  );
  // "" = every bucket; otherwise only the cash, the cheques or the bank.
  const [journalBucket, setJournalBucket] = useState<"" | MoneyBucketKey>("");
  const [openingOpen, setOpeningOpen] = useState(false);
  const canEditSettings = useAuthStore((s) => s.hasPermission("settings", "edit"));
  const { data: invoiceMarginData, isPending: isLoadingInvoiceMargin } = useInvoiceMargin(
    startDate,
    endDate,
    activeReport === "invoiceMargin"
  );
  const { data: supplierSpendData, isPending: isLoadingSupplierSpend } =
    useSupplierSpend(startDate, endDate, activeReport === "supplierSpend");
  const { data: outstandingData, isPending: isLoadingOutstanding } =
    useOutstandingPayments(activeReport === "outstanding");
  const { data: conversionData, isPending: isLoadingConversion } =
    useQuoteConversionStats(startDate, endDate, activeReport === "conversion");
  const { data: expensesData, isPending: isLoadingExpenses } = useExpensesReport(
    startDate,
    endDate,
    activeReport === "expenses"
  );
  const { data: posDailyData, isPending: isLoadingPosDaily } =
    usePosDailyReport(posDate, undefined, activeReport === "posDaily");
  const { data: lowStockData, isPending: isLoadingLowStock } =
    useLowStock(undefined, locationFilter, activeReport === "lowStock");
  const { data: valuationData, isPending: isLoadingValuation } =
    useInventoryValuation(locationFilter, activeReport === "inventoryValuation");
  const { data: pipelineData, isPending: isLoadingPipeline } =
    usePipelineReport(startDate, endDate, activeReport === "pipeline");
  const { data: expensesByCategoryData, isPending: isLoadingExpensesByCategory } =
    useExpensesByCategory(startDate, endDate, activeReport === "expensesByCategory");
  const { data: taxSummaryData, isPending: isLoadingTaxSummary } =
    useTaxSummary(startDate, endDate, activeReport === "taxSummary");
  const { data: accountingData, isPending: isLoadingAccounting } =
    useAccountingExport(startDate, endDate, activeReport === "accountingExport");

  const router = useRouter();
  const profitColumns = useTableColumns(
    "report-profit-margin",
    [
      { key: "product", label: t("reports:profitMargin.product"), hideable: false },
      { key: "quantity", label: t("reports:profitMargin.quantity") },
      { key: "revenue", label: t("reports:profitMargin.revenue") },
      { key: "cost", label: t("reports:profitMargin.cost") },
      { key: "margin", label: t("reports:profitMargin.margin") },
      { key: "marginPercent", label: t("reports:profitMargin.marginPercent") },
    ],
    profitData
  );
  const invoiceMarginColumns = useTableColumns(
    "report-invoice-margin",
    [
      { key: "invoice", label: t("reports:invoiceMargin.invoice"), hideable: false },
      { key: "date", label: t("reports:invoiceMargin.date") },
      { key: "client", label: t("reports:invoiceMargin.client") },
      { key: "amountDue", label: t("reports:invoiceMargin.amountDue") },
      { key: "paid", label: t("reports:invoiceMargin.paid") },
      { key: "remaining", label: t("reports:invoiceMargin.remaining") },
      { key: "revenue", label: t("reports:invoiceMargin.revenue") },
      { key: "margin", label: t("reports:invoiceMargin.margin") },
    ],
    invoiceMarginData?.rows
  );
  const outstandingColumns = useTableColumns(
    "report-outstanding",
    [
      { key: "invoice", label: t("reports:outstanding.invoice"), hideable: false },
      { key: "client", label: t("reports:outstanding.client") },
      { key: "issueDate", label: t("reports:outstanding.issueDate") },
      { key: "dueDate", label: t("reports:outstanding.dueDate") },
      { key: "status", label: t("reports:outstanding.status") },
      { key: "amount", label: t("reports:outstanding.amount") },
    ],
    outstandingData
  );
  const accountingColumns = useTableColumns(
    "report-accounting-journal",
    [
      { key: "date", label: t("reports:accountingExport.date") },
      { key: "entryType", label: t("reports:accountingExport.entryType") },
      { key: "document", label: t("reports:accountingExport.document"), hideable: false },
      { key: "party", label: t("reports:accountingExport.party"), isEmpty: (r) => !r.party },
      { key: "discount", label: t("reports:accountingExport.discount") },
      { key: "ht", label: t("reports:accountingExport.ht") },
      { key: "vat", label: t("reports:accountingExport.vat") },
      { key: "ttc", label: t("reports:accountingExport.ttc") },
    ],
    // The rows on screen: the table stops at the first hundred.
    accountingData?.journal.slice(0, 100)
  );

  const exportToCSV = async (data: unknown[], filename: string) => {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0] as Record<string, unknown>);
    const csvContent = [
      headers.join(";"),
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = (row as Record<string, unknown>)[header];
            return typeof value === "number" ? value.toString().replace(".", ",") : value;
          })
          .join(";")
      ),
    ].join("\n");

    try {
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(t("reports:exportSuccess", { path: filename }));
    } catch {
      toast.error(t("reports:exportError"));
    }
  };

  // Generic PDF export: renders the current tab's table into a clean A4 landscape
  // document (title, date range, columns, rows, totals) via @react-pdf/renderer.
  const exportToPDF = async (
    title: string,
    columns: ReportPDFColumn[],
    rows: string[][],
    filename: string,
    totals?: { label: string; value: string }[]
  ) => {
    if (!rows || rows.length === 0) return;

    let subtitle: string | undefined;
    if (activeReport === "outstanding") {
      subtitle = undefined;
    } else if (activeReport === "lowStock" || activeReport === "inventoryValuation") {
      const loc = locations?.find((l) => l.id === locationFilter);
      subtitle = loc ? `${t("reports:filters.location")}: ${loc.name}` : undefined;
    } else if (activeReport === "posDaily") {
      subtitle = `${t("reports:date")}: ${formatDate(posDate)}`;
    } else {
      subtitle = `${t("reports:from")}: ${formatDate(startDate)}  —  ${t("reports:to")}: ${formatDate(endDate)}`;
    }

    try {
      // Load @react-pdf/renderer on demand so the heavy PDF engine stays out
      // of the reports page chunk and is only fetched on the first export.
      const [{ pdf }, { ReportPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/features/pdf/ReportPDF"),
      ]);
      const blob = await pdf(
        <ReportPDF
          title={title}
          subtitle={subtitle}
          columns={columns}
          rows={rows}
          totals={totals}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(t("reports:exportSuccess", { path: filename }));
    } catch {
      toast.error(t("reports:exportError"));
    }
  };

  const renderReport = () => {
    switch (activeReport) {
      case "pipeline": {
        if (isLoadingPipeline) return <LoadingSpinner />;
        const pipeline = pipelineData;
        const statusLabel = (s: string) => t(`common:status.${s.toLowerCase()}`);
        // Every known state is listed, empty ones included: "0 unpaid" is an
        // answer, a missing row is not.
        const countRows = [
          ...(pipeline?.quotes ?? []).map((b) => ({
            kind: t("reports:pipeline.quotes"),
            status: statusLabel(b.status),
            count: b.count,
            total: b.total,
          })),
          ...(pipeline?.invoices ?? []).map((b) => ({
            kind: t("reports:pipeline.invoices"),
            status: statusLabel(b.status),
            count: b.count,
            total: b.total,
          })),
          ...(pipeline?.delivery_notes ?? []).map((b) => ({
            kind: t("reports:pipeline.deliveryNotes"),
            status: statusLabel(b.status),
            count: b.count,
            total: b.total,
          })),
        ];
        const progress = pipeline?.in_progress;
        return (
          <div className="space-y-4">
            <ExportBar
              onCsv={() => exportToCSV(countRows, "pilotage")}
              onPdf={() =>
                exportToPDF(
                  t("reports:pipeline.title"),
                  [
                    { header: t("reports:pipeline.document"), flex: 2 },
                    { header: t("reports:pipeline.status"), flex: 2 },
                    { header: t("reports:pipeline.count"), align: "right" },
                    { header: t("reports:pipeline.amount"), align: "right" },
                  ],
                  countRows.map((r) => [
                    r.kind,
                    r.status,
                    String(r.count),
                    r.total > 0 ? formatCurrency(r.total) : "-",
                  ]),
                  "pilotage",
                  [
                    {
                      label: t("reports:pipeline.awaitingInvoice"),
                      value: formatCurrency(progress?.awaiting_invoice_total ?? 0),
                    },
                    {
                      label: t("reports:pipeline.awaitingPayment"),
                      value: formatCurrency(progress?.awaiting_payment_total ?? 0),
                    },
                  ]
                )
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                <p className="text-sm text-(--color-text-secondary)">
                  {t("reports:pipeline.awaitingInvoice")}
                </p>
                <p className="text-lg sm:text-2xl font-bold">
                  <FitAmount>{formatCurrency(progress?.awaiting_invoice_total ?? 0)}</FitAmount>
                </p>
                <p className="text-xs text-(--color-text-secondary) mt-1">
                  {t("reports:pipeline.documentCount", {
                    count: progress?.awaiting_invoice.length ?? 0,
                  })}
                </p>
              </div>
              <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                <p className="text-sm text-(--color-text-secondary)">
                  {t("reports:pipeline.awaitingPayment")}
                </p>
                <p className="text-lg sm:text-2xl font-bold">
                  <FitAmount>{formatCurrency(progress?.awaiting_payment_total ?? 0)}</FitAmount>
                </p>
                <p className="text-xs text-(--color-text-secondary) mt-1">
                  {t("reports:pipeline.documentCount", {
                    count: progress?.awaiting_payment.length ?? 0,
                  })}
                </p>
              </div>
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {t("reports:pipeline.overdue")}
                </p>
                <p className="text-lg sm:text-2xl font-bold text-amber-700 dark:text-amber-300">
                  <FitAmount>{formatCurrency(progress?.overdue_total ?? 0)}</FitAmount>
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  {t("reports:pipeline.documentCount", { count: progress?.overdue_count ?? 0 })}
                </p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:pipeline.document")}</TableHead>
                  <TableHead>{t("reports:pipeline.status")}</TableHead>
                  <TableHead className="text-end">{t("reports:pipeline.count")}</TableHead>
                  <TableHead className="text-end">{t("reports:pipeline.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {countRows.map((r, i) => (
                  <TableRow key={`${r.kind}-${r.status}-${i}`}>
                    <TableCell className="font-medium">{r.kind}</TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell className="text-end">{r.count}</TableCell>
                    <TableNumericCell>
                      {r.total > 0 ? formatCurrency(r.total) : "-"}
                    </TableNumericCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {(progress?.awaiting_payment.length ?? 0) > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-(--color-text-secondary)">
                  {t("reports:pipeline.awaitingPaymentDetail")}
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("reports:pipeline.number")}</TableHead>
                      <TableHead>{t("reports:pipeline.client")}</TableHead>
                      <TableHead>{t("reports:pipeline.dueDate")}</TableHead>
                      <TableHead className="text-end">
                        {t("reports:pipeline.remaining")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {progress?.awaiting_payment.map((row) => (
                      <TableRow key={row.id} onActivate={() => router.push(`/invoices/${row.id}`)}>
                        <TableCell className="whitespace-nowrap font-mono">{row.number}</TableCell>
                        <TableCell>{row.client || "-"}</TableCell>
                        <TableCell>
                          {row.due_date ? formatDate(row.due_date) : "-"}
                          {row.overdue && (
                            <Badge variant="danger" className="ms-2">
                              {t("common:status.overdue")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableNumericCell>
                          {formatCurrency(row.remaining)}
                        </TableNumericCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {(progress?.awaiting_invoice.length ?? 0) > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-(--color-text-secondary)">
                  {t("reports:pipeline.awaitingInvoiceDetail")}
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("reports:pipeline.number")}</TableHead>
                      <TableHead>{t("reports:pipeline.client")}</TableHead>
                      <TableHead>{t("reports:pipeline.date")}</TableHead>
                      <TableHead className="text-end">{t("reports:pipeline.amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {progress?.awaiting_invoice.map((row) => (
                      <TableRow key={row.id} onActivate={() => router.push(`/quotes/${row.id}`)}>
                        <TableCell className="whitespace-nowrap font-mono">{row.number}</TableCell>
                        <TableCell>{row.client || "-"}</TableCell>
                        <TableCell>{formatDate(row.date)}</TableCell>
                        <TableNumericCell>{formatCurrency(row.amount)}</TableNumericCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        );
      }

      case "revenue":
        if (isLoadingRevenue) return <LoadingSpinner />;
        return (
          <div className="space-y-4">
            <ExportBar
              onCsv={() => exportToCSV(revenueData || [], "ca_par_periode")}
              onPdf={() =>
                exportToPDF(
                  t("reports:revenueByPeriod.title"),
                  [
                    { header: t("reports:revenueByPeriod.period"), flex: 2 },
                    { header: t("reports:revenueByPeriod.revenueHt"), align: "right" },
                    { header: t("reports:revenueByPeriod.revenueTtc"), align: "right" },
                    { header: t("reports:revenueByPeriod.invoiceCount"), align: "right" },
                  ],
                  (revenueData || []).map((row) => [
                    row.period,
                    formatCurrency(row.revenue_before_tax),
                    formatCurrency(row.revenue_total),
                    String(row.invoice_count),
                  ]),
                  "ca_par_periode",
                  [
                    {
                      label: t("reports:totalHt"),
                      value: formatCurrency(
                        (revenueData || []).reduce((s, r) => s + r.revenue_before_tax, 0)
                      ),
                    },
                    {
                      label: t("reports:totalTtc"),
                      value: formatCurrency(
                        (revenueData || []).reduce((s, r) => s + r.revenue_total, 0)
                      ),
                    },
                  ]
                )
              }
            />
            {revenueData && revenueData.length > 0 && (
              <SimpleBarChart
                caption={t("reports:revenueByPeriod.revenueTtc")}
                data={revenueData.map((row) => ({
                  label: row.period,
                  value: row.revenue_total,
                }))}
                formatValue={formatCurrency}
              />
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:revenueByPeriod.period")}</TableHead>
                  <TableHead className="text-end">{t("reports:revenueByPeriod.revenueHt")}</TableHead>
                  <TableHead className="text-end">{t("reports:revenueByPeriod.revenueTtc")}</TableHead>
                  <TableHead className="text-end">{t("reports:revenueByPeriod.invoiceCount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueData && revenueData.length > 0 ? (
                  revenueData.map((row) => (
                    <TableRow key={row.period}>
                      <TableCell className="font-medium">{row.period}</TableCell>
                      <TableNumericCell>
                        {formatCurrency(row.revenue_before_tax)}
                      </TableNumericCell>
                      <TableNumericCell>
                        {formatCurrency(row.revenue_total)}
                      </TableNumericCell>
                      <TableCell className="text-end">{row.invoice_count}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {revenueData && revenueData.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-(--color-border-primary)">
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:totalHt")}</p>
                  <p className="text-lg sm:text-2xl font-bold">
                    <FitAmount>
                      {formatCurrency(revenueData.reduce((sum, r) => sum + r.revenue_before_tax, 0))}
                    </FitAmount>
                  </p>
                </div>
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:totalTtc")}</p>
                  <p className="text-lg sm:text-2xl font-bold">
                    <FitAmount>
                      {formatCurrency(revenueData.reduce((sum, r) => sum + r.revenue_total, 0))}
                    </FitAmount>
                  </p>
                </div>
              </div>
            )}
          </div>
        );

      case "clients":
        if (isLoadingClients) return <LoadingSpinner />;
        return (
          <div className="space-y-4">
            <ExportBar
              onCsv={() => exportToCSV(clientData || [], "ca_par_client")}
              onPdf={() =>
                exportToPDF(
                  t("reports:revenueByClient.title"),
                  [
                    { header: t("reports:revenueByClient.client"), flex: 2 },
                    { header: t("reports:revenueByClient.revenueHt"), align: "right" },
                    { header: t("reports:revenueByClient.revenueTtc"), align: "right" },
                    { header: t("reports:revenueByClient.invoiceCount"), align: "right" },
                  ],
                  (clientData || []).map((row) => [
                    row.client_name,
                    formatCurrency(row.revenue_before_tax),
                    formatCurrency(row.revenue_total),
                    String(row.invoice_count),
                  ]),
                  "ca_par_client"
                )
              }
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:revenueByClient.client")}</TableHead>
                  <TableHead className="text-end">{t("reports:revenueByClient.revenueHt")}</TableHead>
                  <TableHead className="text-end">{t("reports:revenueByClient.revenueTtc")}</TableHead>
                  <TableHead className="text-end">{t("reports:revenueByClient.invoiceCount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientData && clientData.length > 0 ? (
                  clientData.map((row) => (
                    <TableRow key={row.client_id}>
                      <TableCell className="font-medium">{row.client_name}</TableCell>
                      <TableNumericCell>
                        {formatCurrency(row.revenue_before_tax)}
                      </TableNumericCell>
                      <TableNumericCell>
                        {formatCurrency(row.revenue_total)}
                      </TableNumericCell>
                      <TableCell className="text-end">{row.invoice_count}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        );

      case "products":
        if (isLoadingProducts) return <LoadingSpinner />;
        return (
          <div className="space-y-4">
            <ExportBar
              onCsv={() => exportToCSV(productData || [], "ventes_produits")}
              onPdf={() =>
                exportToPDF(
                  t("reports:productSales.title"),
                  [
                    { header: t("reports:productSales.product"), flex: 2 },
                    { header: t("reports:productSales.quantitySold"), align: "right" },
                    { header: t("reports:productSales.revenueHt"), align: "right" },
                    { header: t("reports:productSales.revenueTtc"), align: "right" },
                  ],
                  (productData || []).map((row) => [
                    row.product_name,
                    row.quantity_sold.toFixed(2),
                    formatCurrency(row.revenue_before_tax),
                    formatCurrency(row.revenue_total),
                  ]),
                  "ventes_produits"
                )
              }
            />
            {productData && productData.length > 0 && (
              <SimpleBarChart
                caption={t("reports:productSales.revenueTtc")}
                data={productData.slice(0, 15).map((row) => ({
                  label: row.product_name,
                  value: row.revenue_total,
                }))}
                formatValue={formatCurrency}
              />
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:productSales.product")}</TableHead>
                  <TableHead className="text-end">{t("reports:productSales.quantitySold")}</TableHead>
                  <TableHead className="text-end">{t("reports:productSales.revenueHt")}</TableHead>
                  <TableHead className="text-end">{t("reports:productSales.revenueTtc")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productData && productData.length > 0 ? (
                  productData.map((row) => (
                    <TableRow key={row.product_id}>
                      <TableCell className="font-medium">{row.product_name}</TableCell>
                      <TableCell className="text-end">
                        {row.quantity_sold.toFixed(2)}
                      </TableCell>
                      <TableNumericCell>
                        {formatCurrency(row.revenue_before_tax)}
                      </TableNumericCell>
                      <TableNumericCell>
                        {formatCurrency(row.revenue_total)}
                      </TableNumericCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        );

      case "profitMargin": {
        if (isLoadingProfit) return <LoadingSpinner />;
        const totalRevenue = (profitData || []).reduce((s, r) => s + r.revenue, 0);
        const totalCost = (profitData || []).reduce((s, r) => s + r.cost, 0);
        const totalMargin = totalRevenue - totalCost;
        const totalMarginPct = totalRevenue !== 0 ? (totalMargin / totalRevenue) * 100 : 0;
        return (
          <div className="space-y-4">
            <ExportBar
              columns={profitColumns}
              onCsv={() => exportToCSV(profitData || [], "marge_produits")}
              onPdf={() =>
                exportToPDF(
                  t("reports:profitMargin.title"),
                  [
                    { header: t("reports:profitMargin.product"), flex: 2 },
                    { header: t("reports:profitMargin.quantity"), align: "right" },
                    { header: t("reports:profitMargin.revenue"), align: "right" },
                    { header: t("reports:profitMargin.cost"), align: "right" },
                    { header: t("reports:profitMargin.margin"), align: "right" },
                    { header: t("reports:profitMargin.marginPercent"), align: "right" },
                  ],
                  (profitData || []).map((row) => [
                    row.product_name,
                    row.quantity_sold.toFixed(2),
                    formatCurrency(row.revenue),
                    formatCurrency(row.cost),
                    formatCurrency(row.margin),
                    `${row.margin_percent.toFixed(1)}%`,
                  ]),
                  "marge_produits",
                  [
                    { label: t("reports:profitMargin.revenue"), value: formatCurrency(totalRevenue) },
                    { label: t("reports:profitMargin.cost"), value: formatCurrency(totalCost) },
                    { label: t("reports:profitMargin.margin"), value: formatCurrency(totalMargin) },
                    { label: t("reports:profitMargin.marginPercent"), value: `${totalMarginPct.toFixed(1)}%` },
                  ]
                )
              }
            />
            {profitData && profitData.length > 0 && (
              <SimpleBarChart
                caption={t("reports:profitMargin.margin")}
                data={profitData.slice(0, 15).map((row) => ({
                  label: row.product_name,
                  value: row.margin,
                }))}
                formatValue={formatCurrency}
              />
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:profitMargin.product")}</TableHead>
                  {profitColumns.show("quantity") && <TableHead className="text-end">{t("reports:profitMargin.quantity")}</TableHead>}
                  {profitColumns.show("revenue") && <TableHead className="text-end">{t("reports:profitMargin.revenue")}</TableHead>}
                  {profitColumns.show("cost") && <TableHead className="text-end">{t("reports:profitMargin.cost")}</TableHead>}
                  {profitColumns.show("margin") && <TableHead className="text-end">{t("reports:profitMargin.margin")}</TableHead>}
                  {profitColumns.show("marginPercent") && <TableHead className="text-end">{t("reports:profitMargin.marginPercent")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {profitData && profitData.length > 0 ? (
                  profitData.map((row) => (
                    <TableRow key={row.product_id}>
                      <TableCell className="font-medium">{row.product_name}</TableCell>
                      {profitColumns.show("quantity") && <TableCell className="text-end">{row.quantity_sold.toFixed(2)}</TableCell>}
                      {profitColumns.show("revenue") && <TableNumericCell>{formatCurrency(row.revenue)}</TableNumericCell>}
                      {profitColumns.show("cost") && <TableNumericCell>{formatCurrency(row.cost)}</TableNumericCell>}
                      {profitColumns.show("margin") && (
                        <TableNumericCell
                          className={
                            row.margin >= 0
                              ? "text-end font-medium text-green-600 dark:text-green-400"
                              : "text-end font-medium text-red-600 dark:text-red-400"
                          }
                        >
                          {formatCurrency(row.margin)}
                        </TableNumericCell>
                      )}
                      {profitColumns.show("marginPercent") && <TableCell className="text-end">{row.margin_percent.toFixed(1)}%</TableCell>}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={profitColumns.visibleCount}className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {profitData && profitData.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-(--color-border-primary)">
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:profitMargin.revenue")}</p>
                  <p className="text-lg sm:text-2xl font-bold"><FitAmount>{formatCurrency(totalRevenue)}</FitAmount></p>
                </div>
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:profitMargin.cost")}</p>
                  <p className="text-lg sm:text-2xl font-bold"><FitAmount>{formatCurrency(totalCost)}</FitAmount></p>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">{t("reports:profitMargin.margin")}</p>
                  <p className="text-lg sm:text-2xl font-bold text-green-700 dark:text-green-300">
                    <FitAmount>{formatCurrency(totalMargin)}</FitAmount>
                  </p>
                </div>
                <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                  <p className="text-sm text-primary-600 dark:text-primary-400">{t("reports:profitMargin.marginPercent")}</p>
                  <p className="text-lg sm:text-2xl font-bold text-primary-700 dark:text-primary-300">
                    {totalMarginPct.toFixed(1)}%
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      }

      case "cashJournal": {
        if (isLoadingCashJournal) return <LoadingSpinner />;
        const journal = cashJournalData;
        const bucketKeys: MoneyBucketKey[] = ["cash", "cheque", "bank"];
        const rows = (journal?.rows ?? []).filter((r) => !journalBucket || r.bucket === journalBucket);
        const kindLabel = (kind: string) => t(`reports:cashJournal.kinds.${kind}`);
        const methodLabel = (method: string | null) =>
          method ? t(`common:${paymentMethodLabelKey(method)}`) : t("reports:cashJournal.noMethod");
        const exportRows = rows.map((r) => ({
          date: r.date,
          operation: kindLabel(r.kind),
          reference: r.reference,
          party: r.party ?? "",
          method: methodLabel(r.method),
          in: r.amount > 0 ? r.amount : 0,
          out: r.amount < 0 ? -r.amount : 0,
        }));
        return (
          <div className="space-y-4">
            <p className="text-sm text-(--color-text-secondary)">{t("reports:cashJournal.hint")}</p>

            {/* No starting point declared yet: the balances begin at zero. */}
            {journal && !journal.start && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800 dark:border-warning-800 dark:bg-warning-950 dark:text-warning-200">
                <span>{t("reports:cashJournal.noOpening")}</span>
                {canEditSettings && (
                  <Button size="sm" onClick={() => setOpeningOpen(true)} className="shrink-0">
                    {t("reports:cashJournal.setOpening")}
                  </Button>
                )}
              </div>
            )}

            {/* One card per place the money sits: what it opened on, what came
                in and went out, what it holds now. */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {bucketKeys.map((b) => {
                const s = journal?.buckets[b];
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setJournalBucket(journalBucket === b ? "" : b)}
                    aria-pressed={journalBucket === b}
                    className={`text-start p-4 rounded-lg border transition-colors ${
                      journalBucket === b
                        ? "border-primary-500 bg-primary-50 dark:bg-primary-950"
                        : "border-(--color-border-primary) bg-(--color-bg-secondary) hover:border-primary-300"
                    }`}
                  >
                    <p className="text-sm font-medium text-(--color-text-secondary)">
                      {t(`reports:cashJournal.buckets.${b}`)}
                    </p>
                    <p
                      className={`text-lg sm:text-2xl font-bold ${
                        (s?.closing ?? 0) < 0 ? "text-danger-600 dark:text-danger-400" : ""
                      }`}
                    >
                      <FitAmount>{formatCurrency(s?.closing ?? 0)}</FitAmount>
                    </p>
                    <dl className="mt-2 space-y-0.5 text-xs text-(--color-text-secondary)">
                      <div className="flex justify-between gap-2">
                        <dt>{t("reports:cashJournal.opening")}</dt>
                        <dd className="font-mono tabular-nums">{formatCurrency(s?.opening ?? 0)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>{t("reports:cashJournal.in")}</dt>
                        <dd className="font-mono tabular-nums text-success-600 dark:text-success-400">
                          + {formatCurrency(s?.in ?? 0)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>{t("reports:cashJournal.out")}</dt>
                        <dd className="font-mono tabular-nums text-danger-600 dark:text-danger-400">
                          − {formatCurrency(s?.out ?? 0)}
                        </dd>
                      </div>
                    </dl>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-(--color-text-secondary)">
                {journal?.start
                  ? t("reports:cashJournal.since", { date: formatDate(journal.start) })
                  : null}
                {journalBucket && (
                  <button
                    type="button"
                    onClick={() => setJournalBucket("")}
                    className="ms-2 underline hover:text-(--color-text-primary)"
                  >
                    {t("reports:cashJournal.showAll")}
                  </button>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {canEditSettings && journal?.start && (
                  <Button variant="secondary" size="sm" onClick={() => setOpeningOpen(true)}>
                    <Settings2 className="h-4 w-4 me-2" />
                    {t("reports:cashJournal.editOpening")}
                  </Button>
                )}
                <ExportBar
                  onCsv={() => exportToCSV(exportRows, "journal_tresorerie")}
                  onPdf={() =>
                    exportToPDF(
                      t("reports:cashJournal.title"),
                      [
                        { header: t("reports:cashJournal.date") },
                        { header: t("reports:cashJournal.operation"), flex: 2 },
                        { header: t("reports:cashJournal.party"), flex: 2 },
                        { header: t("reports:cashJournal.method") },
                        { header: t("reports:cashJournal.in"), align: "right" },
                        { header: t("reports:cashJournal.out"), align: "right" },
                      ],
                      rows.map((r) => [
                        formatDate(r.date),
                        `${kindLabel(r.kind)} ${r.reference}`.trim(),
                        r.party ?? "",
                        methodLabel(r.method),
                        r.amount > 0 ? formatCurrency(r.amount) : "",
                        r.amount < 0 ? formatCurrency(-r.amount) : "",
                      ]),
                      "journal_tresorerie",
                      bucketKeys.map((b) => ({
                        label: t(`reports:cashJournal.buckets.${b}`),
                        value: formatCurrency(journal?.buckets[b].closing ?? 0),
                      }))
                    )
                  }
                />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:cashJournal.date")}</TableHead>
                  <TableHead>{t("reports:cashJournal.operation")}</TableHead>
                  <TableHead>{t("reports:cashJournal.party")}</TableHead>
                  <TableHead>{t("reports:cashJournal.method")}</TableHead>
                  <TableHead className="text-end">{t("reports:cashJournal.in")}</TableHead>
                  <TableHead className="text-end">{t("reports:cashJournal.out")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length > 0 ? (
                  rows.map((r) => (
                    <TableRow
                      key={`${r.kind}-${r.id}`}
                      onActivate={r.link ? () => router.push(r.link!) : undefined}
                    >
                      <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                      <TableCell>
                        <span className="block">{kindLabel(r.kind)}</span>
                        <span className="block text-xs text-(--color-text-secondary) font-mono">{r.reference}</span>
                      </TableCell>
                      <TableCell>{r.party ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={r.bucket ? "default" : "warning"}>{methodLabel(r.method)}</Badge>
                      </TableCell>
                      <TableNumericCell className="text-success-600 dark:text-success-400">
                        {r.amount > 0 ? formatCurrency(r.amount) : ""}
                      </TableNumericCell>
                      <TableNumericCell className="text-danger-600 dark:text-danger-400">
                        {r.amount < 0 ? formatCurrency(-r.amount) : ""}
                      </TableNumericCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Money whose method places it nowhere is listed but not counted:
                guessing "cash" would make the drawer lie. */}
            {(journal?.unclassified.count ?? 0) > 0 && !journalBucket && (
              <p className="text-xs text-(--color-text-secondary)">
                {t("reports:cashJournal.unclassified", {
                  count: journal!.unclassified.count,
                  amount: formatCurrency(Math.abs(journal!.unclassified.total)),
                })}
              </p>
            )}

            {openingOpen && (
              <CashJournalOpeningModal open={openingOpen} onClose={() => setOpeningOpen(false)} journal={journal} />
            )}
          </div>
        );
      }

      case "invoiceMargin": {
        if (isLoadingInvoiceMargin) return <LoadingSpinner />;
        const rows = invoiceMarginData?.rows ?? [];
        const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + pick(r), 0);
        const totals = {
          revenue: sum((r) => r.revenue),
          cost: sum((r) => r.cost),
          margin: sum((r) => r.margin),
          amountDue: sum((r) => r.amount_due),
          paid: sum((r) => r.paid),
          remaining: sum((r) => r.remaining),
        };
        const totalMarginPct = totals.revenue !== 0 ? (totals.margin / totals.revenue) * 100 : 0;
        const expensesTotal = invoiceMarginData?.expenses_total ?? 0;
        const netProfit = totals.margin - expensesTotal;
        const col = invoiceMarginColumns.show;
        const signed = (n: number) =>
          n >= 0 ? "text-success-600 dark:text-success-400" : "text-danger-600 dark:text-danger-400";
        return (
          <div className="space-y-4">
            <p className="text-sm text-(--color-text-secondary)">{t("reports:invoiceMargin.hint")}</p>
            <ExportBar
              columns={invoiceMarginColumns}
              onCsv={() => exportToCSV(rows, "marge_factures")}
              onPdf={() =>
                exportToPDF(
                  t("reports:invoiceMargin.title"),
                  [
                    { header: t("reports:invoiceMargin.invoice") },
                    { header: t("reports:invoiceMargin.date") },
                    { header: t("reports:invoiceMargin.client"), flex: 2 },
                    { header: t("reports:invoiceMargin.amountDue"), align: "right" },
                    { header: t("reports:invoiceMargin.paid"), align: "right" },
                    { header: t("reports:invoiceMargin.remaining"), align: "right" },
                    { header: t("reports:invoiceMargin.revenue"), align: "right" },
                    { header: t("reports:invoiceMargin.cost"), align: "right" },
                    { header: t("reports:invoiceMargin.margin"), align: "right" },
                    { header: t("reports:invoiceMargin.marginPercent"), align: "right" },
                  ],
                  rows.map((r) => [
                    r.invoice_number,
                    formatDate(r.issue_date),
                    r.client_name,
                    formatCurrency(r.amount_due),
                    formatCurrency(r.paid),
                    formatCurrency(r.remaining),
                    formatCurrency(r.revenue),
                    formatCurrency(r.cost),
                    formatCurrency(r.margin),
                    `${r.margin_percent.toFixed(1)}%`,
                  ]),
                  "marge_factures",
                  [
                    { label: t("reports:invoiceMargin.revenue"), value: formatCurrency(totals.revenue) },
                    { label: t("reports:invoiceMargin.totalMargin"), value: formatCurrency(totals.margin) },
                    { label: t("reports:invoiceMargin.expenses"), value: formatCurrency(expensesTotal) },
                    { label: t("reports:invoiceMargin.netProfit"), value: formatCurrency(netProfit) },
                    { label: t("reports:invoiceMargin.totalRemaining"), value: formatCurrency(totals.remaining) },
                  ]
                )
              }
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:invoiceMargin.invoice")}</TableHead>
                  {col("date") && <TableHead>{t("reports:invoiceMargin.date")}</TableHead>}
                  {col("client") && <TableHead>{t("reports:invoiceMargin.client")}</TableHead>}
                  {col("amountDue") && <TableHead className="text-end">{t("reports:invoiceMargin.amountDue")}</TableHead>}
                  {col("paid") && <TableHead className="text-end">{t("reports:invoiceMargin.paid")}</TableHead>}
                  {col("remaining") && <TableHead className="text-end">{t("reports:invoiceMargin.remaining")}</TableHead>}
                  {col("revenue") && <TableHead className="text-end">{t("reports:invoiceMargin.revenue")}</TableHead>}
                  {col("margin") && <TableHead className="text-end">{t("reports:invoiceMargin.margin")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length > 0 ? (
                  <>
                    {rows.map((r) => (
                        <TableRow key={r.invoice_id} onActivate={() => router.push(`/invoices/${r.invoice_id}`)}>
                          <TableCell className="whitespace-nowrap font-mono font-medium">{r.invoice_number}</TableCell>
                          {col("date") && <TableCell className="whitespace-nowrap">{formatDate(r.issue_date)}</TableCell>}
                          {col("client") && <TableCell className="min-w-40">{r.client_name}</TableCell>}
                          {col("amountDue") && <TableNumericCell>{formatCurrency(r.amount_due)}</TableNumericCell>}
                          {col("paid") && (
                            <TableNumericCell className={r.remaining <= 0 ? "text-success-600 dark:text-success-400" : undefined}>
                              {formatCurrency(r.paid)}
                            </TableNumericCell>
                          )}
                          {/* Settled reads green, credit still owed reads red: the
                              one glance the column exists for. */}
                          {col("remaining") &&
                            (r.remaining > 0 ? (
                              <TableNumericCell className="font-medium text-danger-600 dark:text-danger-400">
                                {formatCurrency(r.remaining)}
                              </TableNumericCell>
                            ) : (
                              <TableCell className="text-end">
                                <Badge variant="success">{t("reports:invoiceMargin.settled")}</Badge>
                              </TableCell>
                            ))}
                          {col("revenue") && <TableNumericCell>{formatCurrency(r.revenue)}</TableNumericCell>}
                          {/* The purchase cost stays in the exports: on screen the
                              margin and its rate are what is read, and ten columns
                              no longer fit a laptop. */}
                          {col("margin") && (
                            <TableNumericCell className={`font-medium ${signed(r.margin)}`}>
                              {formatCurrency(r.margin)}
                              <span className="block text-xs font-normal text-(--color-text-secondary)">
                                {r.margin_percent.toFixed(1)}%
                              </span>
                            </TableNumericCell>
                          )}
                        </TableRow>
                    ))}
                    <TableRow className="bg-(--color-bg-secondary) font-semibold">
                      <TableCell>{t("common:labels.total")}</TableCell>
                      {col("date") && <TableCell />}
                      {col("client") && <TableCell />}
                      {col("amountDue") && <TableNumericCell>{formatCurrency(totals.amountDue)}</TableNumericCell>}
                      {col("paid") && <TableNumericCell>{formatCurrency(totals.paid)}</TableNumericCell>}
                      {col("remaining") && (
                        <TableNumericCell className={totals.remaining > 0 ? "text-danger-600 dark:text-danger-400" : undefined}>
                          {formatCurrency(totals.remaining)}
                        </TableNumericCell>
                      )}
                      {col("revenue") && <TableNumericCell>{formatCurrency(totals.revenue)}</TableNumericCell>}
                      {col("margin") && (
                        <TableNumericCell className={signed(totals.margin)}>
                          {formatCurrency(totals.margin)}
                          <span className="block text-xs font-normal text-(--color-text-secondary)">
                            {totalMarginPct.toFixed(1)}%
                          </span>
                        </TableNumericCell>
                      )}
                    </TableRow>
                  </>
                ) : (
                  <TableRow>
                    <TableCell colSpan={invoiceMarginColumns.visibleCount} className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-(--color-border-primary)">
              <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                <p className="text-sm text-(--color-text-secondary)">{t("reports:invoiceMargin.totalMargin")}</p>
                <p className={`text-lg sm:text-2xl font-bold ${signed(totals.margin)}`}>
                  <FitAmount>{formatCurrency(totals.margin)}</FitAmount>
                </p>
              </div>
              <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                <p className="text-sm text-(--color-text-secondary)">
                  {t("reports:invoiceMargin.expenses")}
                  {invoiceMarginData && invoiceMarginData.expense_count > 0 && ` (${invoiceMarginData.expense_count})`}
                </p>
                <p className="text-lg sm:text-2xl font-bold">
                  <FitAmount>{`− ${formatCurrency(expensesTotal)}`}</FitAmount>
                </p>
              </div>
              <div
                className={`p-4 rounded-lg ${netProfit >= 0 ? "bg-success-50 dark:bg-success-950" : "bg-danger-50 dark:bg-danger-950"}`}
              >
                <p className={`text-sm ${signed(netProfit)}`}>{t("reports:invoiceMargin.netProfit")}</p>
                <p className={`text-lg sm:text-2xl font-bold ${signed(netProfit)}`}>
                  <FitAmount>{formatCurrency(netProfit)}</FitAmount>
                </p>
              </div>
              <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                <p className="text-sm text-(--color-text-secondary)">{t("reports:invoiceMargin.totalRemaining")}</p>
                <p
                  className={`text-lg sm:text-2xl font-bold ${totals.remaining > 0 ? "text-danger-600 dark:text-danger-400" : ""}`}
                >
                  <FitAmount>{formatCurrency(totals.remaining)}</FitAmount>
                </p>
              </div>
            </div>
          </div>
        );
      }

      case "supplierSpend": {
        if (isLoadingSupplierSpend) return <LoadingSpinner />;
        const totalSpend = (supplierSpendData || []).reduce((s, r) => s + r.total_spend, 0);
        return (
          <div className="space-y-4">
            <ExportBar
              onCsv={() => exportToCSV(supplierSpendData || [], "depenses_fournisseurs")}
              onPdf={() =>
                exportToPDF(
                  t("reports:supplierSpend.title"),
                  [
                    { header: t("reports:supplierSpend.supplier"), flex: 2 },
                    { header: t("reports:supplierSpend.orderCount"), align: "right" },
                    { header: t("reports:supplierSpend.totalSpend"), align: "right" },
                  ],
                  (supplierSpendData || []).map((row) => [
                    row.supplier_name,
                    String(row.order_count),
                    formatCurrency(row.total_spend),
                  ]),
                  "depenses_fournisseurs",
                  [{ label: t("reports:supplierSpend.total"), value: formatCurrency(totalSpend) }]
                )
              }
            />
            {supplierSpendData && supplierSpendData.length > 0 && (
              <SimpleBarChart
                caption={t("reports:supplierSpend.totalSpend")}
                data={supplierSpendData.slice(0, 15).map((row) => ({
                  label: row.supplier_name,
                  value: row.total_spend,
                }))}
                formatValue={formatCurrency}
              />
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:supplierSpend.supplier")}</TableHead>
                  <TableHead className="text-end">{t("reports:supplierSpend.orderCount")}</TableHead>
                  <TableHead className="text-end">{t("reports:supplierSpend.totalSpend")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierSpendData && supplierSpendData.length > 0 ? (
                  supplierSpendData.map((row) => (
                    <TableRow key={row.supplier_id}>
                      <TableCell className="font-medium">{row.supplier_name}</TableCell>
                      <TableCell className="text-end">{row.order_count}</TableCell>
                      <TableNumericCell className="font-medium">
                        {formatCurrency(row.total_spend)}
                      </TableNumericCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {supplierSpendData && supplierSpendData.length > 0 && (
              <div className="pt-4 border-t border-(--color-border-primary)">
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:supplierSpend.total")}</p>
                  <p className="text-lg sm:text-2xl font-bold"><FitAmount>{formatCurrency(totalSpend)}</FitAmount></p>
                </div>
              </div>
            )}
          </div>
        );
      }

      case "outstanding":
        if (isLoadingOutstanding) return <LoadingSpinner />;
        return (
          <div className="space-y-4">
            <ExportBar
              columns={outstandingColumns}
              onCsv={() => exportToCSV(outstandingData || [], "impayes")}
              onPdf={() =>
                exportToPDF(
                  t("reports:outstanding.title"),
                  [
                    { header: t("reports:outstanding.invoice") },
                    { header: t("reports:outstanding.client"), flex: 2 },
                    { header: t("reports:outstanding.issueDate") },
                    { header: t("reports:outstanding.dueDate") },
                    { header: t("reports:outstanding.amount"), align: "right" },
                  ],
                  (outstandingData || []).map((row) => [
                    row.invoice_number,
                    row.client_name,
                    formatDate(row.issue_date),
                    formatDate(row.due_date),
                    formatCurrency(row.total),
                  ]),
                  "impayes",
                  [
                    {
                      label: t("reports:totalUnpaid"),
                      value: formatCurrency(
                        (outstandingData || []).reduce((s, r) => s + r.total, 0)
                      ),
                    },
                  ]
                )
              }
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:outstanding.invoice")}</TableHead>
                  {outstandingColumns.show("client") && <TableHead>{t("reports:outstanding.client")}</TableHead>}
                  {outstandingColumns.show("issueDate") && <TableHead>{t("reports:outstanding.issueDate")}</TableHead>}
                  {outstandingColumns.show("dueDate") && <TableHead>{t("reports:outstanding.dueDate")}</TableHead>}
                  {outstandingColumns.show("status") && <TableHead>{t("reports:outstanding.status")}</TableHead>}
                  {outstandingColumns.show("amount") && <TableHead className="text-end">{t("reports:outstanding.amount")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstandingData && outstandingData.length > 0 ? (
                  outstandingData.map((row) => (
                    <TableRow key={row.invoice_id} onActivate={() => router.push(`/invoices/${row.invoice_id}`)}>
                      <TableCell className="whitespace-nowrap font-mono font-medium">
                        {row.invoice_number}
                      </TableCell>
                      {outstandingColumns.show("client") && <TableCell>{row.client_name}</TableCell>}
                      {outstandingColumns.show("issueDate") && <TableCell>{formatDate(row.issue_date)}</TableCell>}
                      {outstandingColumns.show("dueDate") && <TableCell>{formatDate(row.due_date)}</TableCell>}
                      {outstandingColumns.show("status") && (
                        <TableCell>
                          {row.days_overdue > 0 ? (
                            <Badge variant="danger">
                              {t("reports:daysOverdue", { count: row.days_overdue })}
                            </Badge>
                          ) : (
                            <Badge variant="warning">{t("reports:dueNow")}</Badge>
                          )}
                        </TableCell>
                      )}
                      {outstandingColumns.show("amount") && (
                        <TableNumericCell className="font-medium">
                          {formatCurrency(row.total)}
                        </TableNumericCell>
                      )}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={outstandingColumns.visibleCount}className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noUnpaidInvoices")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {outstandingData && outstandingData.length > 0 && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{t("reports:totalUnpaid")}</p>
                <p className="text-lg sm:text-2xl font-bold text-red-700 dark:text-red-300">
                  {formatCurrency(
                    outstandingData.reduce((sum, r) => sum + r.total, 0)
                  )}
                </p>
              </div>
            )}
          </div>
        );

      case "conversion":
        if (isLoadingConversion) return <LoadingSpinner />;
        return (
          <div className="space-y-6">
            {conversionData && (
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    exportToPDF(
                      t("reports:quoteConversion.title"),
                      [
                        { header: t("reports:quoteConversion.metric"), flex: 2 },
                        { header: t("reports:quoteConversion.value"), align: "right" },
                      ],
                      [
                        [t("reports:quoteConversion.totalQuotes"), String(conversionData.total_quotes)],
                        [t("reports:acceptedQuotes"), String(conversionData.converted_quotes)],
                        [t("reports:quoteConversion.refusedQuotes"), String(conversionData.refused_quotes)],
                        [t("reports:quoteConversion.conversionRate"), `${conversionData.conversion_rate.toFixed(1)}%`],
                        [t("reports:quoteConversion.totalQuotedAmount"), formatCurrency(conversionData.total_quoted_amount)],
                        [t("reports:quoteConversion.convertedAmount"), formatCurrency(conversionData.converted_amount)],
                      ],
                      "taux_conversion_devis"
                    )
                  }
                >
                  <FileDown className="h-4 w-4 me-2" />
                  {t("reports:exportPdf")}
                </Button>
              </div>
            )}
            {conversionData && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:quoteConversion.totalQuotes")}</p>
                  <p className="text-lg sm:text-2xl font-bold">{conversionData.total_quotes}</p>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">{t("reports:acceptedQuotes")}</p>
                  <p className="text-lg sm:text-2xl font-bold text-green-700 dark:text-green-300">
                    {conversionData.converted_quotes}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-600 dark:text-blue-400">{t("reports:quoteConversion.conversionRate")}</p>
                  <p className="text-lg sm:text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {conversionData.conversion_rate.toFixed(1)}%
                  </p>
                </div>
                <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                  <p className="text-sm text-primary-600 dark:text-primary-400">{t("reports:quoteConversion.convertedAmount")}</p>
                  <p className="text-lg sm:text-2xl font-bold text-primary-700 dark:text-primary-300">
                    <FitAmount>{formatCurrency(conversionData.converted_amount)}</FitAmount>
                  </p>
                </div>
              </div>
            )}
            {conversionData && (
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{t("reports:quoteConversion.conversionRate")}</span>
                        <span>{conversionData.conversion_rate.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                        <div
                          className="bg-green-500 h-4 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(conversionData.conversion_rate, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-(--color-text-secondary)">{t("reports:quoteConversion.totalQuotedAmount")}</p>
                        <p className="font-medium">
                          {formatCurrency(conversionData.total_quoted_amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-(--color-text-secondary)">{t("reports:quoteConversion.convertedAmount")}</p>
                        <p className="font-medium text-green-600 dark:text-green-400">
                          {formatCurrency(conversionData.converted_amount)}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case "posDaily": {
        if (isLoadingPosDaily) return <LoadingSpinner />;
        if (!posDailyData) {
          return (
            <p className="text-center text-(--color-text-secondary) py-8">
              {t("reports:posDaily.noData")}
            </p>
          );
        }
        const posStats: { label: string; value: number; highlight?: boolean }[] = [
          { label: t("reports:posDaily.sessionCount"), value: posDailyData.session_count },
          { label: t("reports:posDaily.transactionCount"), value: posDailyData.transaction_count },
          { label: t("reports:posDaily.totalSales"), value: posDailyData.total_sales, highlight: true },
          { label: t("reports:posDaily.subtotal"), value: posDailyData.subtotal },
          { label: t("reports:posDaily.taxAmount"), value: posDailyData.tax_amount },
          // One line per method actually used, so cheques and transfers show up
          // instead of silently swelling the difference with total sales.
          ...(posDailyData.sales_by_method ?? []).map((row) => ({
            label: t(`pos:${row.method.toLowerCase()}`, { defaultValue: row.method }),
            value: row.amount,
          })),
          { label: t("reports:posDaily.cancelledCount"), value: posDailyData.cancelled_count },
          { label: t("reports:posDaily.cancelledTotal"), value: posDailyData.cancelled_total },
        ];
        const isCount = (label: string) =>
          label === t("reports:posDaily.sessionCount") ||
          label === t("reports:posDaily.transactionCount") ||
          label === t("reports:posDaily.cancelledCount");
        return (
          <div className="space-y-4">
            <ExportBar
              onCsv={() => exportToCSV([posDailyData], "rapport_caisse_journalier")}
              onPdf={() =>
                exportToPDF(
                  t("reports:posDaily.title"),
                  [
                    { header: t("reports:posDaily.metric"), flex: 2 },
                    { header: t("reports:posDaily.value"), align: "right" },
                  ],
                  posStats.map((stat) => [
                    stat.label,
                    isCount(stat.label) ? String(stat.value) : formatCurrency(stat.value),
                  ]),
                  "rapport_caisse_journalier"
                )
              }
            />
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {posStats.map((stat) => (
                <div
                  key={stat.label}
                  className={
                    stat.highlight
                      ? "p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg"
                      : "p-4 bg-(--color-bg-secondary) rounded-lg"
                  }
                >
                  <p
                    className={
                      stat.highlight
                        ? "text-sm text-primary-600 dark:text-primary-400"
                        : "text-sm text-(--color-text-secondary)"
                    }
                  >
                    {stat.label}
                  </p>
                  <p
                    className={
                      stat.highlight
                        ? "text-lg sm:text-2xl font-bold text-primary-700 dark:text-primary-300"
                        : "text-lg sm:text-2xl font-bold"
                    }
                  >
                    {isCount(stat.label) ? stat.value : formatCurrency(stat.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case "expenses":
        if (isLoadingExpenses) return <LoadingSpinner />;
        return (
          <div className="space-y-4">
            <ExportBar
              onCsv={() => exportToCSV(expensesData || [], "depenses")}
              onPdf={() =>
                exportToPDF(
                  t("reports:expenses.title"),
                  [
                    { header: t("reports:expenses.period"), flex: 2 },
                    { header: t("reports:expenses.expenseCount"), align: "right" },
                    { header: t("reports:expenses.totalAmount"), align: "right" },
                  ],
                  (expensesData || []).map((row) => [
                    row.period,
                    String(row.expense_count),
                    formatCurrency(row.total_amount),
                  ]),
                  "depenses",
                  [
                    {
                      label: t("reports:expenses.total"),
                      value: formatCurrency(
                        (expensesData || []).reduce((s, r) => s + r.total_amount, 0)
                      ),
                    },
                  ]
                )
              }
            />
            {expensesData && expensesData.length > 0 && (
              <SimpleBarChart
                caption={t("reports:expenses.totalAmount")}
                data={expensesData.map((row) => ({
                  label: row.period,
                  value: row.total_amount,
                }))}
                formatValue={formatCurrency}
              />
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:expenses.period")}</TableHead>
                  <TableHead className="text-end">{t("reports:expenses.expenseCount")}</TableHead>
                  <TableHead className="text-end">{t("reports:expenses.totalAmount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expensesData && expensesData.length > 0 ? (
                  expensesData.map((row) => (
                    <TableRow key={row.period}>
                      <TableCell className="font-medium">{row.period}</TableCell>
                      <TableCell className="text-end">{row.expense_count}</TableCell>
                      <TableNumericCell>
                        {formatCurrency(row.total_amount)}
                      </TableNumericCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {expensesData && expensesData.length > 0 && (
              <div className="pt-4 border-t border-(--color-border-primary)">
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:expenses.total")}</p>
                  <p className="text-lg sm:text-2xl font-bold">
                    {formatCurrency(
                      expensesData.reduce((sum, r) => sum + r.total_amount, 0)
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        );

      case "lowStock":
        if (isLoadingLowStock) return <LoadingSpinner />;
        return (
          <div className="space-y-4">
            <ExportBar
              onCsv={() => exportToCSV(lowStockData || [], "stock_faible")}
              onPdf={() =>
                exportToPDF(
                  t("reports:lowStock.title"),
                  [
                    { header: t("reports:lowStock.product"), flex: 2 },
                    { header: t("reports:lowStock.variant"), flex: 2 },
                    { header: t("reports:lowStock.quantity"), align: "right" },
                    { header: t("reports:lowStock.threshold"), align: "right" },
                  ],
                  (lowStockData || []).map((row) => [
                    row.designation,
                    row.variant_name ?? "-",
                    String(row.quantity),
                    String(row.threshold),
                  ]),
                  "stock_faible"
                )
              }
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:lowStock.product")}</TableHead>
                  <TableHead>{t("reports:lowStock.variant")}</TableHead>
                  <TableHead className="text-end">{t("reports:lowStock.quantity")}</TableHead>
                  <TableHead className="text-end">{t("reports:lowStock.threshold")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockData && lowStockData.length > 0 ? (
                  lowStockData.map((row) => (
                    <TableRow key={`${row.product_id}-${row.variant_id ?? "root"}`}>
                      <TableCell className="font-medium">{row.designation}</TableCell>
                      <TableCell className="text-(--color-text-secondary)">
                        {row.variant_name ?? "-"}
                      </TableCell>
                      <TableCell className="text-end">
                        <Badge variant={row.quantity > 0 ? "warning" : "danger"}>
                          {row.quantity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end">{row.threshold}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:lowStock.noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        );

      case "inventoryValuation": {
        if (isLoadingValuation) return <LoadingSpinner />;
        const totalValue = (valuationData || []).reduce((s, r) => s + r.stock_value, 0);
        return (
          <div className="space-y-4">
            <ExportBar
              onCsv={() => exportToCSV(valuationData || [], "valorisation_stock")}
              onPdf={() =>
                exportToPDF(
                  t("reports:inventoryValuation.title"),
                  [
                    { header: t("reports:inventoryValuation.product"), flex: 2 },
                    { header: t("reports:inventoryValuation.quantity"), align: "right" },
                    { header: t("reports:inventoryValuation.purchasePrice"), align: "right" },
                    { header: t("reports:inventoryValuation.stockValue"), align: "right" },
                  ],
                  (valuationData || []).map((row) => [
                    row.designation,
                    String(row.quantity),
                    formatCurrency(row.purchase_price),
                    formatCurrency(row.stock_value),
                  ]),
                  "valorisation_stock",
                  [
                    {
                      label: t("reports:inventoryValuation.totalValue"),
                      value: formatCurrency(totalValue),
                    },
                  ]
                )
              }
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:inventoryValuation.product")}</TableHead>
                  <TableHead className="text-end">{t("reports:inventoryValuation.quantity")}</TableHead>
                  <TableHead className="text-end">{t("reports:inventoryValuation.purchasePrice")}</TableHead>
                  <TableHead className="text-end">{t("reports:inventoryValuation.stockValue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {valuationData && valuationData.length > 0 ? (
                  valuationData.map((row) => (
                    <TableRow key={row.product_id}>
                      <TableCell className="font-medium">{row.designation}</TableCell>
                      <TableCell className="text-end">{row.quantity}</TableCell>
                      <TableNumericCell>
                        {formatCurrency(row.purchase_price)}
                      </TableNumericCell>
                      <TableNumericCell className="font-medium">
                        {formatCurrency(row.stock_value)}
                      </TableNumericCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {valuationData && valuationData.length > 0 && (
              <div className="pt-4 border-t border-(--color-border-primary)">
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:inventoryValuation.totalValue")}</p>
                  <p className="text-lg sm:text-2xl font-bold"><FitAmount>{formatCurrency(totalValue)}</FitAmount></p>
                </div>
              </div>
            )}
          </div>
        );
      }

      case "expensesByCategory": {
        if (isLoadingExpensesByCategory) return <LoadingSpinner />;
        const report = expensesByCategoryData;
        const rows = report?.categories ?? [];
        // Unfiled spending is a real row, not a gap: the parts must add up to
        // the total shown at the bottom.
        const labelOf = (name: string | null) => name ?? t("reports:expensesByCategory.uncategorized");
        const exportRows = rows.map((r) => ({
          category: labelOf(r.category_name),
          expense_count: r.expense_count,
          total_amount: r.total_amount,
          share: Math.round(r.share * 10) / 10,
        }));
        return (
          <div className="space-y-4">
            <ExportBar
              onCsv={() => exportToCSV(exportRows, "depenses_par_poste")}
              onPdf={() =>
                exportToPDF(
                  t("reports:expensesByCategory.title"),
                  [
                    { header: t("reports:expensesByCategory.category"), flex: 2 },
                    { header: t("reports:expensesByCategory.expenseCount"), align: "right" },
                    { header: t("reports:expensesByCategory.totalAmount"), align: "right" },
                    { header: t("reports:expensesByCategory.share"), align: "right" },
                  ],
                  rows.map((r) => [
                    labelOf(r.category_name),
                    String(r.expense_count),
                    formatCurrency(r.total_amount),
                    `${r.share.toFixed(1)}%`,
                  ]),
                  "depenses_par_poste",
                  [
                    {
                      label: t("reports:expensesByCategory.total"),
                      value: formatCurrency(report?.total ?? 0),
                    },
                  ]
                )
              }
            />
            {rows.length > 0 && (
              <SimpleBarChart
                caption={t("reports:expensesByCategory.totalAmount")}
                data={rows.map((r) => ({ label: labelOf(r.category_name), value: r.total_amount }))}
                formatValue={formatCurrency}
              />
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:expensesByCategory.category")}</TableHead>
                  <TableHead className="text-end">{t("reports:expensesByCategory.expenseCount")}</TableHead>
                  <TableHead className="text-end">{t("reports:expensesByCategory.totalAmount")}</TableHead>
                  <TableHead className="text-end">{t("reports:expensesByCategory.share")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length > 0 ? (
                  rows.map((r) => (
                    <TableRow key={r.category_id ?? "uncategorized"}>
                      <TableCell className="font-medium">{labelOf(r.category_name)}</TableCell>
                      <TableCell className="text-end">{r.expense_count}</TableCell>
                      <TableNumericCell>{formatCurrency(r.total_amount)}</TableNumericCell>
                      <TableCell className="text-end">{r.share.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {/* The same money split by who recorded it: one employee's spending
                told apart from another's. */}
            {(report?.authors?.length ?? 0) > 0 && (
              <>
                <h3 className="pt-2 text-sm font-semibold text-(--color-text-primary)">
                  {t("reports:expensesByCategory.byAuthor")}
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("reports:expensesByCategory.author")}</TableHead>
                      <TableHead className="text-end">{t("reports:expensesByCategory.expenseCount")}</TableHead>
                      <TableHead className="text-end">{t("reports:expensesByCategory.totalAmount")}</TableHead>
                      <TableHead className="text-end">{t("reports:expensesByCategory.share")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report!.authors!.map((r) => (
                      <TableRow key={r.user_id ?? "unknown"}>
                        <TableCell className="font-medium">
                          {r.user_name ?? t("reports:expensesByCategory.unknownAuthor")}
                        </TableCell>
                        <TableCell className="text-end">{r.expense_count}</TableCell>
                        <TableNumericCell>{formatCurrency(r.total_amount)}</TableNumericCell>
                        <TableCell className="text-end">{r.share.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
            {rows.length > 0 && (
              <div className="pt-4 border-t border-(--color-border-primary)">
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">
                    {t("reports:expensesByCategory.total")}
                  </p>
                  <p className="text-lg sm:text-2xl font-bold"><FitAmount>{formatCurrency(report?.total ?? 0)}</FitAmount></p>
                </div>
              </div>
            )}
          </div>
        );
      }

      case "taxSummary": {
        if (isLoadingTaxSummary) return <LoadingSpinner />;
        if (!taxSummaryData) {
          return (
            <p className="text-center text-(--color-text-secondary) py-8">
              {t("reports:noData")}
            </p>
          );
        }
        const ts = taxSummaryData;
        // Flat per-rate breakdown for deterministic CSV/PDF export.
        const rateRows = [
          ...ts.sales.by_rate.map((r) => ({
            type: t("reports:taxSummary.sales"),
            tax_rate: r.tax_rate,
            ht: r.total_ht,
            vat: r.total_vat,
            ttc: r.total_ttc,
          })),
          ...ts.purchases.by_rate.map((r) => ({
            type: t("reports:taxSummary.purchases"),
            tax_rate: r.tax_rate,
            ht: r.total_ht,
            vat: r.total_vat,
            ttc: r.total_ttc,
          })),
        ];
        // A commercial discount lowers the declared base without appearing on any
        // line, so state it: gross − discount = base. Hidden when there is none,
        // to keep the ordinary declaration uncluttered.
        const hasSalesDiscount = ts.sales.discount_ht > 0;
        const taxTotals = [
          ...(hasSalesDiscount
            ? [
                { label: t("reports:taxSummary.grossHt"), value: formatCurrency(ts.sales.gross_ht) },
                { label: t("reports:taxSummary.discountHt"), value: `-${formatCurrency(ts.sales.discount_ht)}` },
                { label: t("reports:taxSummary.taxableHt"), value: formatCurrency(ts.sales.total_ht) },
              ]
            : []),
          { label: t("reports:taxSummary.salesVat"), value: formatCurrency(ts.sales.total_vat) },
          { label: t("reports:taxSummary.purchasesVat"), value: formatCurrency(ts.purchases.total_vat) },
          { label: t("reports:taxSummary.netVat"), value: formatCurrency(ts.net_vat) },
          ...(ts.stamp_duty.enabled
            ? [{ label: t("reports:taxSummary.stampDutyDue"), value: formatCurrency(ts.stamp_duty.amount_due) }]
            : []),
        ];
        return (
          <div className="space-y-4">
            <ExportBar
              onCsv={() => exportToCSV(rateRows, "declaration_tva")}
              onPdf={() =>
                exportToPDF(
                  t("reports:taxSummary.title"),
                  [
                    { header: t("reports:taxSummary.type"), flex: 2 },
                    { header: t("reports:taxSummary.rate"), align: "right" },
                    { header: t("reports:taxSummary.ht"), align: "right" },
                    { header: t("reports:taxSummary.vat"), align: "right" },
                    { header: t("reports:taxSummary.ttc"), align: "right" },
                  ],
                  rateRows.map((r) => [
                    r.type,
                    `${r.tax_rate}%`,
                    formatCurrency(r.ht),
                    formatCurrency(r.vat),
                    formatCurrency(r.ttc),
                  ]),
                  "declaration_tva",
                  taxTotals
                )
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                <p className="text-sm text-(--color-text-secondary)">{t("reports:taxSummary.salesVat")}</p>
                <p className="text-lg sm:text-2xl font-bold"><FitAmount>{formatCurrency(ts.sales.total_vat)}</FitAmount></p>
              </div>
              <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                <p className="text-sm text-(--color-text-secondary)">{t("reports:taxSummary.purchasesVat")}</p>
                <p className="text-lg sm:text-2xl font-bold"><FitAmount>{formatCurrency(ts.purchases.total_vat)}</FitAmount></p>
              </div>
              <div
                className={
                  ts.net_vat >= 0
                    ? "p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg"
                    : "p-4 bg-green-50 dark:bg-green-900/20 rounded-lg"
                }
              >
                <p className="text-sm text-primary-600 dark:text-primary-400">{t("reports:taxSummary.netVat")}</p>
                <p className="text-lg sm:text-2xl font-bold text-primary-700 dark:text-primary-300">
                  <FitAmount>{formatCurrency(ts.net_vat)}</FitAmount>
                </p>
              </div>
              {ts.stamp_duty.enabled && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <p className="text-sm text-amber-600 dark:text-amber-400">{t("reports:taxSummary.stampDutyDue")}</p>
                  <p className="text-lg sm:text-2xl font-bold text-amber-700 dark:text-amber-300">
                    <FitAmount>{formatCurrency(ts.stamp_duty.amount_due)}</FitAmount>
                  </p>
                </div>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:taxSummary.type")}</TableHead>
                  <TableHead className="text-end">{t("reports:taxSummary.rate")}</TableHead>
                  <TableHead className="text-end">{t("reports:taxSummary.ht")}</TableHead>
                  <TableHead className="text-end">{t("reports:taxSummary.vat")}</TableHead>
                  <TableHead className="text-end">{t("reports:taxSummary.ttc")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rateRows.length > 0 ? (
                  rateRows.map((r, i) => (
                    <TableRow key={`${r.type}-${r.tax_rate}-${i}`}>
                      <TableCell className="font-medium">{r.type}</TableCell>
                      <TableCell className="text-end">{r.tax_rate}%</TableCell>
                      <TableNumericCell>{formatCurrency(r.ht)}</TableNumericCell>
                      <TableNumericCell>{formatCurrency(r.vat)}</TableNumericCell>
                      <TableNumericCell>{formatCurrency(r.ttc)}</TableNumericCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {hasSalesDiscount && (
              <p className="text-xs text-(--color-text-secondary)">
                {t("reports:taxSummary.discountNote", {
                  gross: formatCurrency(ts.sales.gross_ht),
                  discount: formatCurrency(ts.sales.discount_ht),
                  base: formatCurrency(ts.sales.total_ht),
                })}
              </p>
            )}
            {ts.stamp_duty.enabled && (
              <p className="text-xs text-(--color-text-secondary)">
                {t("reports:taxSummary.stampDutyNote")}
              </p>
            )}
          </div>
        );
      }

      case "accountingExport": {
        if (isLoadingAccounting) return <LoadingSpinner />;
        if (!accountingData) {
          return (
            <p className="text-center text-(--color-text-secondary) py-8">
              {t("reports:noData")}
            </p>
          );
        }
        const ae = accountingData;
        // The CSV always carries gross and discount; on screen the column only
        // earns its width when the period actually granted one.
        const hasDiscountRow = ae.journal.some((r) => r.discount > 0);
        const showDiscount = hasDiscountRow && accountingColumns.show("discount");
        const show = accountingColumns.show;
        const counts: { label: string; value: number; data: unknown[]; filename: string }[] = [
          { label: t("reports:accountingExport.sales"), value: ae.sales.length, data: ae.sales, filename: "ventes" },
          { label: t("reports:accountingExport.purchases"), value: ae.purchases.length, data: ae.purchases, filename: "achats" },
          { label: t("reports:accountingExport.payments"), value: ae.payments.length, data: ae.payments, filename: "reglements" },
          { label: t("reports:accountingExport.expenses"), value: ae.expenses.length, data: ae.expenses, filename: "depenses" },
        ];
        return (
          <div className="space-y-4">
            <p className="text-sm text-(--color-text-secondary)">
              {t("reports:accountingExport.description")}
            </p>
            <p className="text-xs text-(--color-text-secondary)">{t("reports:accountingExport.fecHint")}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <ColumnPicker columns={accountingColumns} />
              <Button
                variant="primary"
                size="sm"
                onClick={() => exportToCSV(ae.journal, "journal_comptable")}
              >
                <Download className="h-4 w-4 me-2" />
                {t("reports:accountingExport.downloadJournal")}
              </Button>
              {/* The same period as double-entry lines, in the FEC layout an
                  accountant imports (src/lib/fec.ts). */}
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const tab = claimDownloadTab();
                  try {
                    const res = await fetch(
                      `${API_BASE_URL}/api/reports/fec?startDate=${startDate}&endDate=${endDate}`,
                      { credentials: "include" }
                    );
                    if (!res.ok) throw new Error(String(res.status));
                    const name =
                      /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "FEC.txt";
                    deliverPdf(await res.blob(), name, tab, t("common:pdfViewer.openPdf"));
                  } catch {
                    tab?.close();
                    toast.error(t("reports:accountingExport.fecFailed"));
                  }
                }}
              >
                <Download className="h-4 w-4 me-2" />
                {t("reports:accountingExport.downloadFec")}
              </Button>
              {counts.map((c) => (
                <Button
                  key={c.filename}
                  variant="secondary"
                  size="sm"
                  onClick={() => exportToCSV(c.data, c.filename)}
                  disabled={c.value === 0}
                >
                  <Download className="h-4 w-4 me-2" />
                  {c.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {counts.map((c) => (
                <div key={c.filename} className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{c.label}</p>
                  <p className="text-lg sm:text-2xl font-bold">{c.value}</p>
                </div>
              ))}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  {show("date") && <TableHead>{t("reports:accountingExport.date")}</TableHead>}
                  {show("entryType") && <TableHead>{t("reports:accountingExport.entryType")}</TableHead>}
                  <TableHead>{t("reports:accountingExport.document")}</TableHead>
                  {show("party") && <TableHead>{t("reports:accountingExport.party")}</TableHead>}
                  {showDiscount && (
                    <TableHead className="text-end">{t("reports:accountingExport.discount")}</TableHead>
                  )}
                  {show("ht") && <TableHead className="text-end">{t("reports:accountingExport.ht")}</TableHead>}
                  {show("vat") && <TableHead className="text-end">{t("reports:accountingExport.vat")}</TableHead>}
                  {show("ttc") && <TableHead className="text-end">{t("reports:accountingExport.ttc")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ae.journal.length > 0 ? (
                  ae.journal.slice(0, 100).map((row, i) => (
                    <TableRow key={`${row.type}-${row.document}-${i}`}>
                      {show("date") && <TableCell>{formatDate(row.date)}</TableCell>}
                      {show("entryType") && <TableCell>{t(`reports:accountingExport.types.${row.type}`)}</TableCell>}
                      <TableCell className="whitespace-nowrap font-mono">{row.document || "-"}</TableCell>
                      {show("party") && <TableCell>{row.party || "-"}</TableCell>}
                      {showDiscount && (
                        <TableNumericCell>
                          {row.discount > 0 ? `-${formatCurrency(row.discount)}` : "-"}
                        </TableNumericCell>
                      )}
                      {show("ht") && <TableNumericCell>{formatCurrency(row.ht)}</TableNumericCell>}
                      {show("vat") && <TableNumericCell>{formatCurrency(row.vat)}</TableNumericCell>}
                      {show("ttc") && <TableNumericCell>{formatCurrency(row.ttc)}</TableNumericCell>}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={accountingColumns.visibleCount - (show("discount") && !showDiscount ? 1 : 0)}className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {ae.journal.length > 100 && (
              <p className="text-xs text-(--color-text-secondary) text-center">
                {t("reports:accountingExport.truncatedNote", { count: ae.journal.length })}
              </p>
            )}
          </div>
        );
      }
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("reports:title")} subtitle={t("reports:subtitle")} />

      {/* The reports wrap onto as many rows as they need: a bar that scrolls
          sideways hides the ones past the edge, and people never find them. */}
      <div className="flex flex-wrap items-center gap-2">
        {visibleReports.map((report) => (
          <Button
            key={report.id}
            variant={activeReport === report.id ? "primary" : "secondary"}
            onClick={() => setActiveReport(report.id)}
            className="whitespace-nowrap"
          >
            <report.icon className="h-4 w-4 me-2" />
            {report.label}
          </Button>
        ))}
        <ReportTabsPicker tabs={reportTabs} />
      </div>

      {activeReport === "posDaily" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t("reports:posDaily.date")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex-1 sm:flex-none sm:w-44">
              <DateInput
                id="report-pos-date"
                name="report-pos-date"
                label={t("reports:date")}
                value={posDate}
                onChange={(e) => setPosDate(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {multiLocation &&
        (activeReport === "lowStock" || activeReport === "inventoryValuation") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {t("reports:filters.location")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="sm:w-64">
                <select
                  id="report-location-filter"
                  name="report-location-filter"
                  value={reportLocation}
                  onChange={(e) => setReportLocation(e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">{t("reports:filters.allLocations")}</option>
                  {locations?.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>
        )}

      {activeReport !== "outstanding" &&
        activeReport !== "posDaily" &&
        activeReport !== "lowStock" &&
        activeReport !== "inventoryValuation" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t("reports:filters.dateRange")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <div className="flex-1 sm:flex-none sm:w-44">
                <DateInput
                  id="report-start-date"
                  name="report-start-date"
                  label={t("reports:from")}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex-1 sm:flex-none sm:w-44">
                <DateInput
                  id="report-end-date"
                  name="report-end-date"
                  label={t("reports:to")}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {reports.find((r) => r.id === activeReport)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>{renderReport()}</CardContent>
      </Card>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );
}
