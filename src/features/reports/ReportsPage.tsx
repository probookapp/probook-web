import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@/stores/useToastStore";
import {
  BarChart3,
  Users,
  Package,
  AlertCircle,
  TrendingUp,
  Download,
  Calendar,
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
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  useRevenueByMonth,
  useRevenueByClient,
  useProductSales,
  useOutstandingPayments,
  useQuoteConversionStats,
} from "./hooks/useReports";

type ReportType = "revenue" | "clients" | "products" | "outstanding" | "conversion";

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
  const { data: outstandingData, isLoading: isLoadingOutstanding } =
    useOutstandingPayments();
  const { data: conversionData, isLoading: isLoadingConversion } =
    useQuoteConversionStats(startDate, endDate);

  const reports = [
    { id: "revenue" as const, label: t("reports:revenueByPeriod.title"), icon: BarChart3 },
    { id: "clients" as const, label: t("reports:revenueByClient.title"), icon: Users },
    { id: "products" as const, label: t("reports:productSales.title"), icon: Package },
    { id: "outstanding" as const, label: t("reports:outstanding.title"), icon: AlertCircle },
    { id: "conversion" as const, label: t("reports:quoteConversion.title"), icon: TrendingUp },
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

  const renderReport = () => {
    switch (activeReport) {
      case "revenue":
        if (isLoadingRevenue) return <LoadingSpinner />;
        return (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportToCSV(revenueData || [], "ca_par_periode")}
              >
                <Download className="h-4 w-4 mr-2" />
                {t("reports:exportCsv")}
              </Button>
            </div>
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
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportToCSV(clientData || [], "ca_par_client")}
              >
                <Download className="h-4 w-4 mr-2" />
                {t("reports:exportCsv")}
              </Button>
            </div>
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
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportToCSV(productData || [], "ventes_produits")}
              >
                <Download className="h-4 w-4 mr-2" />
                {t("reports:exportCsv")}
              </Button>
            </div>
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

      case "outstanding":
        if (isLoadingOutstanding) return <LoadingSpinner />;
        return (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportToCSV(outstandingData || [], "impayes")}
              >
                <Download className="h-4 w-4 mr-2" />
                {t("reports:exportCsv")}
              </Button>
            </div>
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

      {activeReport !== "outstanding" && (
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
