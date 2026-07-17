import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { pdf } from "@react-pdf/renderer";
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
  Percent,
  FileSpreadsheet,
} from "lucide-react";
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
  Badge,
} from "@/components/ui";
import { ReportPDF, type ReportPDFColumn } from "@/features/pdf";
import { formatCurrency, formatDate } from "@/lib/utils";
import { locationsApi } from "@/lib/api";
import { useLowStock } from "@/features/products/hooks/useStock";
import {
  useRevenueByMonth,
  useRevenueByClient,
  useProductSales,
  useOutstandingPayments,
  useQuoteConversionStats,
  useExpensesReport,
  useProfitMargin,
  useSupplierSpend,
  useInventoryValuation,
  usePosDailyReport,
  useTaxSummary,
  useAccountingExport,
} from "./hooks/useReports";

type ReportType =
  | "revenue"
  | "clients"
  | "products"
  | "profitMargin"
  | "supplierSpend"
  | "outstanding"
  | "conversion"
  | "posDaily"
  | "expenses"
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
function ExportBar({ onCsv, onPdf }: { onCsv: () => void; onPdf: () => void }) {
  const { t } = useTranslation(["reports"]);
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" size="sm" onClick={onPdf}>
        <FileDown className="h-4 w-4 mr-2" />
        {t("reports:exportPdf")}
      </Button>
      <Button variant="secondary" size="sm" onClick={onCsv}>
        <Download className="h-4 w-4 mr-2" />
        {t("reports:exportCsv")}
      </Button>
    </div>
  );
}

export function ReportsPage() {
  const { t } = useTranslation(["reports", "common"]);
  const [activeReport, setActiveReport] = useState<ReportType>("revenue");
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

  const { data: revenueData, isLoading: isLoadingRevenue } = useRevenueByMonth(
    startDate,
    endDate
  );
  const { data: clientData, isLoading: isLoadingClients } = useRevenueByClient(
    startDate,
    endDate
  );
  const { data: productData, isLoading: isLoadingProducts } = useProductSales(
    startDate,
    endDate
  );
  const { data: profitData, isLoading: isLoadingProfit } = useProfitMargin(
    startDate,
    endDate
  );
  const { data: supplierSpendData, isLoading: isLoadingSupplierSpend } =
    useSupplierSpend(startDate, endDate);
  const { data: outstandingData, isLoading: isLoadingOutstanding } =
    useOutstandingPayments();
  const { data: conversionData, isLoading: isLoadingConversion } =
    useQuoteConversionStats(startDate, endDate);
  const { data: expensesData, isLoading: isLoadingExpenses } = useExpensesReport(
    startDate,
    endDate
  );
  const { data: posDailyData, isLoading: isLoadingPosDaily } =
    usePosDailyReport(posDate);
  const { data: lowStockData, isLoading: isLoadingLowStock } =
    useLowStock(undefined, locationFilter);
  const { data: valuationData, isLoading: isLoadingValuation } =
    useInventoryValuation(locationFilter);
  const { data: taxSummaryData, isLoading: isLoadingTaxSummary } =
    useTaxSummary(startDate, endDate);
  const { data: accountingData, isLoading: isLoadingAccounting } =
    useAccountingExport(startDate, endDate);

  const reports = [
    { id: "revenue" as const, label: t("reports:revenueByPeriod.title"), icon: BarChart3 },
    { id: "clients" as const, label: t("reports:revenueByClient.title"), icon: Users },
    { id: "products" as const, label: t("reports:productSales.title"), icon: Package },
    { id: "profitMargin" as const, label: t("reports:profitMargin.title"), icon: DollarSign },
    { id: "supplierSpend" as const, label: t("reports:supplierSpend.title"), icon: Truck },
    { id: "outstanding" as const, label: t("reports:outstanding.title"), icon: AlertCircle },
    { id: "conversion" as const, label: t("reports:quoteConversion.title"), icon: TrendingUp },
    { id: "posDaily" as const, label: t("reports:posDaily.title"), icon: Calculator },
    { id: "expenses" as const, label: t("reports:expenses.title"), icon: Receipt },
    { id: "lowStock" as const, label: t("reports:lowStock.title"), icon: AlertTriangle },
    { id: "inventoryValuation" as const, label: t("reports:inventoryValuation.title"), icon: Boxes },
    { id: "taxSummary" as const, label: t("reports:taxSummary.title"), icon: Percent },
    { id: "accountingExport" as const, label: t("reports:accountingExport.title"), icon: FileSpreadsheet },
  ];

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
                  <TableHead className="text-right">{t("reports:revenueByPeriod.revenueHt")}</TableHead>
                  <TableHead className="text-right">{t("reports:revenueByPeriod.revenueTtc")}</TableHead>
                  <TableHead className="text-right">{t("reports:revenueByPeriod.invoiceCount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueData && revenueData.length > 0 ? (
                  revenueData.map((row) => (
                    <TableRow key={row.period}>
                      <TableCell className="font-medium">{row.period}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.revenue_before_tax)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.revenue_total)}
                      </TableCell>
                      <TableCell className="text-right">{row.invoice_count}</TableCell>
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
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-(--color-border)">
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:totalHt")}</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(
                      revenueData.reduce((sum, r) => sum + r.revenue_before_tax, 0)
                    )}
                  </p>
                </div>
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:totalTtc")}</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(
                      revenueData.reduce((sum, r) => sum + r.revenue_total, 0)
                    )}
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
                  <TableHead className="text-right">{t("reports:revenueByClient.revenueHt")}</TableHead>
                  <TableHead className="text-right">{t("reports:revenueByClient.revenueTtc")}</TableHead>
                  <TableHead className="text-right">{t("reports:revenueByClient.invoiceCount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientData && clientData.length > 0 ? (
                  clientData.map((row) => (
                    <TableRow key={row.client_id}>
                      <TableCell className="font-medium">{row.client_name}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.revenue_before_tax)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.revenue_total)}
                      </TableCell>
                      <TableCell className="text-right">{row.invoice_count}</TableCell>
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
                  <TableHead className="text-right">{t("reports:productSales.quantitySold")}</TableHead>
                  <TableHead className="text-right">{t("reports:productSales.revenueHt")}</TableHead>
                  <TableHead className="text-right">{t("reports:productSales.revenueTtc")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productData && productData.length > 0 ? (
                  productData.map((row) => (
                    <TableRow key={row.product_id}>
                      <TableCell className="font-medium">{row.product_name}</TableCell>
                      <TableCell className="text-right">
                        {row.quantity_sold.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.revenue_before_tax)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.revenue_total)}
                      </TableCell>
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
                  <TableHead className="text-right">{t("reports:profitMargin.quantity")}</TableHead>
                  <TableHead className="text-right">{t("reports:profitMargin.revenue")}</TableHead>
                  <TableHead className="text-right">{t("reports:profitMargin.cost")}</TableHead>
                  <TableHead className="text-right">{t("reports:profitMargin.margin")}</TableHead>
                  <TableHead className="text-right">{t("reports:profitMargin.marginPercent")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profitData && profitData.length > 0 ? (
                  profitData.map((row) => (
                    <TableRow key={row.product_id}>
                      <TableCell className="font-medium">{row.product_name}</TableCell>
                      <TableCell className="text-right">{row.quantity_sold.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.cost)}</TableCell>
                      <TableCell
                        className={
                          row.margin >= 0
                            ? "text-right font-medium text-green-600 dark:text-green-400"
                            : "text-right font-medium text-red-600 dark:text-red-400"
                        }
                      >
                        {formatCurrency(row.margin)}
                      </TableCell>
                      <TableCell className="text-right">{row.margin_percent.toFixed(1)}%</TableCell>
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
            {profitData && profitData.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-(--color-border)">
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:profitMargin.revenue")}</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
                </div>
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:profitMargin.cost")}</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalCost)}</p>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">{t("reports:profitMargin.margin")}</p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {formatCurrency(totalMargin)}
                  </p>
                </div>
                <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                  <p className="text-sm text-primary-600 dark:text-primary-400">{t("reports:profitMargin.marginPercent")}</p>
                  <p className="text-2xl font-bold text-primary-700 dark:text-primary-300">
                    {totalMarginPct.toFixed(1)}%
                  </p>
                </div>
              </div>
            )}
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
                  <TableHead className="text-right">{t("reports:supplierSpend.orderCount")}</TableHead>
                  <TableHead className="text-right">{t("reports:supplierSpend.totalSpend")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierSpendData && supplierSpendData.length > 0 ? (
                  supplierSpendData.map((row) => (
                    <TableRow key={row.supplier_id}>
                      <TableCell className="font-medium">{row.supplier_name}</TableCell>
                      <TableCell className="text-right">{row.order_count}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.total_spend)}
                      </TableCell>
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
              <div className="pt-4 border-t border-(--color-border)">
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:supplierSpend.total")}</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalSpend)}</p>
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
                  <TableHead>{t("reports:outstanding.client")}</TableHead>
                  <TableHead>{t("reports:outstanding.issueDate")}</TableHead>
                  <TableHead>{t("reports:outstanding.dueDate")}</TableHead>
                  <TableHead>{t("reports:outstanding.status")}</TableHead>
                  <TableHead className="text-right">{t("reports:outstanding.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstandingData && outstandingData.length > 0 ? (
                  outstandingData.map((row) => (
                    <TableRow key={row.invoice_id}>
                      <TableCell className="font-mono font-medium">
                        {row.invoice_number}
                      </TableCell>
                      <TableCell>{row.client_name}</TableCell>
                      <TableCell>{formatDate(row.issue_date)}</TableCell>
                      <TableCell>{formatDate(row.due_date)}</TableCell>
                      <TableCell>
                        {row.days_overdue > 0 ? (
                          <Badge variant="danger">
                            {t("reports:daysOverdue", { count: row.days_overdue })}
                          </Badge>
                        ) : (
                          <Badge variant="warning">{t("reports:dueNow")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.total)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-(--color-text-secondary) py-8">
                      {t("reports:noUnpaidInvoices")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {outstandingData && outstandingData.length > 0 && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{t("reports:totalUnpaid")}</p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">
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
                        [t("reports:quoteConversion.conversionRate"), `${conversionData.conversion_rate.toFixed(1)}%`],
                        [t("reports:quoteConversion.totalQuotedAmount"), formatCurrency(conversionData.total_quoted_amount)],
                        [t("reports:quoteConversion.convertedAmount"), formatCurrency(conversionData.converted_amount)],
                      ],
                      "taux_conversion_devis"
                    )
                  }
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  {t("reports:exportPdf")}
                </Button>
              </div>
            )}
            {conversionData && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:quoteConversion.totalQuotes")}</p>
                  <p className="text-2xl font-bold">{conversionData.total_quotes}</p>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">{t("reports:acceptedQuotes")}</p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {conversionData.converted_quotes}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-600 dark:text-blue-400">{t("reports:quoteConversion.conversionRate")}</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {conversionData.conversion_rate.toFixed(1)}%
                  </p>
                </div>
                <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                  <p className="text-sm text-primary-600 dark:text-primary-400">{t("reports:quoteConversion.convertedAmount")}</p>
                  <p className="text-2xl font-bold text-primary-700 dark:text-primary-300">
                    {formatCurrency(conversionData.converted_amount)}
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
          { label: t("reports:posDaily.cashSales"), value: posDailyData.cash_sales },
          { label: t("reports:posDaily.cardSales"), value: posDailyData.card_sales },
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
                        ? "text-2xl font-bold text-primary-700 dark:text-primary-300"
                        : "text-2xl font-bold"
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
                  <TableHead className="text-right">{t("reports:expenses.expenseCount")}</TableHead>
                  <TableHead className="text-right">{t("reports:expenses.totalAmount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expensesData && expensesData.length > 0 ? (
                  expensesData.map((row) => (
                    <TableRow key={row.period}>
                      <TableCell className="font-medium">{row.period}</TableCell>
                      <TableCell className="text-right">{row.expense_count}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.total_amount)}
                      </TableCell>
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
              <div className="pt-4 border-t border-(--color-border)">
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:expenses.total")}</p>
                  <p className="text-2xl font-bold">
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
                  <TableHead className="text-right">{t("reports:lowStock.quantity")}</TableHead>
                  <TableHead className="text-right">{t("reports:lowStock.threshold")}</TableHead>
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
                      <TableCell className="text-right">
                        <Badge variant={row.quantity > 0 ? "warning" : "danger"}>
                          {row.quantity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{row.threshold}</TableCell>
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
                  <TableHead className="text-right">{t("reports:inventoryValuation.quantity")}</TableHead>
                  <TableHead className="text-right">{t("reports:inventoryValuation.purchasePrice")}</TableHead>
                  <TableHead className="text-right">{t("reports:inventoryValuation.stockValue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {valuationData && valuationData.length > 0 ? (
                  valuationData.map((row) => (
                    <TableRow key={row.product_id}>
                      <TableCell className="font-medium">{row.designation}</TableCell>
                      <TableCell className="text-right">{row.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.purchase_price)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.stock_value)}
                      </TableCell>
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
              <div className="pt-4 border-t border-(--color-border)">
                <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{t("reports:inventoryValuation.totalValue")}</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
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
        const taxTotals = [
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                <p className="text-sm text-(--color-text-secondary)">{t("reports:taxSummary.salesVat")}</p>
                <p className="text-2xl font-bold">{formatCurrency(ts.sales.total_vat)}</p>
              </div>
              <div className="p-4 bg-(--color-bg-secondary) rounded-lg">
                <p className="text-sm text-(--color-text-secondary)">{t("reports:taxSummary.purchasesVat")}</p>
                <p className="text-2xl font-bold">{formatCurrency(ts.purchases.total_vat)}</p>
              </div>
              <div
                className={
                  ts.net_vat >= 0
                    ? "p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg"
                    : "p-4 bg-green-50 dark:bg-green-900/20 rounded-lg"
                }
              >
                <p className="text-sm text-primary-600 dark:text-primary-400">{t("reports:taxSummary.netVat")}</p>
                <p className="text-2xl font-bold text-primary-700 dark:text-primary-300">
                  {formatCurrency(ts.net_vat)}
                </p>
              </div>
              {ts.stamp_duty.enabled && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <p className="text-sm text-amber-600 dark:text-amber-400">{t("reports:taxSummary.stampDutyDue")}</p>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                    {formatCurrency(ts.stamp_duty.amount_due)}
                  </p>
                </div>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:taxSummary.type")}</TableHead>
                  <TableHead className="text-right">{t("reports:taxSummary.rate")}</TableHead>
                  <TableHead className="text-right">{t("reports:taxSummary.ht")}</TableHead>
                  <TableHead className="text-right">{t("reports:taxSummary.vat")}</TableHead>
                  <TableHead className="text-right">{t("reports:taxSummary.ttc")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rateRows.length > 0 ? (
                  rateRows.map((r, i) => (
                    <TableRow key={`${r.type}-${r.tax_rate}-${i}`}>
                      <TableCell className="font-medium">{r.type}</TableCell>
                      <TableCell className="text-right">{r.tax_rate}%</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.ht)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.vat)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.ttc)}</TableCell>
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
            {ts.stamp_duty.enabled && (
              <p className="text-xs text-(--color-text-secondary)">
                {t("reports:taxSummary.stampDutyNote", {
                  rate: ts.stamp_duty.rate,
                  base: formatCurrency(ts.stamp_duty.cash_payments_total),
                })}
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
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => exportToCSV(ae.journal, "journal_comptable")}
              >
                <Download className="h-4 w-4 mr-2" />
                {t("reports:accountingExport.downloadJournal")}
              </Button>
              {counts.map((c) => (
                <Button
                  key={c.filename}
                  variant="secondary"
                  size="sm"
                  onClick={() => exportToCSV(c.data, c.filename)}
                  disabled={c.value === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {c.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {counts.map((c) => (
                <div key={c.filename} className="p-4 bg-(--color-bg-secondary) rounded-lg">
                  <p className="text-sm text-(--color-text-secondary)">{c.label}</p>
                  <p className="text-2xl font-bold">{c.value}</p>
                </div>
              ))}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports:accountingExport.date")}</TableHead>
                  <TableHead>{t("reports:accountingExport.entryType")}</TableHead>
                  <TableHead>{t("reports:accountingExport.document")}</TableHead>
                  <TableHead>{t("reports:accountingExport.party")}</TableHead>
                  <TableHead className="text-right">{t("reports:accountingExport.ht")}</TableHead>
                  <TableHead className="text-right">{t("reports:accountingExport.vat")}</TableHead>
                  <TableHead className="text-right">{t("reports:accountingExport.ttc")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ae.journal.length > 0 ? (
                  ae.journal.slice(0, 100).map((row, i) => (
                    <TableRow key={`${row.type}-${row.document}-${i}`}>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell>{t(`reports:accountingExport.types.${row.type}`)}</TableCell>
                      <TableCell className="font-mono">{row.document || "-"}</TableCell>
                      <TableCell>{row.party || "-"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.ht)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.vat)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.ttc)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-(--color-text-secondary) py-8">
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
      <div>
        <h1 className="text-2xl font-bold text-(--color-text-primary)">{t("reports:title")}</h1>
        <p className="text-(--color-text-secondary)">{t("reports:subtitle")}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mb-2 scrollbar-thin">
        {reports.map((report) => (
          <Button
            key={report.id}
            variant={activeReport === report.id ? "primary" : "secondary"}
            onClick={() => setActiveReport(report.id)}
            className="whitespace-nowrap"
          >
            <report.icon className="h-4 w-4 mr-2" />
            {report.label}
          </Button>
        ))}
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
