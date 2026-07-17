import { useParams, useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Undo2, FileText } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from "@/components/ui";
import { useCreditNote } from "./hooks/useCreditNotes";
import { formatCurrency, formatDate } from "@/lib/utils";

export function CreditNoteViewPage() {
  const { t } = useTranslation(["invoices", "common"]);
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: creditNote, isLoading } = useCreditNote(id ?? "");

  if (isLoading || !creditNote) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/invoices/credit-notes")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("common:buttons.back")}
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-(--color-text-primary)">
              {creditNote.credit_note_number}
            </h1>
            <Badge variant="info">{t("invoices:creditNotes.title")}</Badge>
            {creditNote.restocked && (
              <Badge variant="success">{t("invoices:creditNotes.restockedBadge")}</Badge>
            )}
          </div>
          <p className="text-(--color-text-secondary) truncate">{creditNote.client?.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("invoices:creditNotes.detailsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-(--color-text-secondary)">{t("invoices:fields.issueDate")}</p>
                  <p className="font-medium">{formatDate(creditNote.issue_date)}</p>
                </div>
                {creditNote.reason && (
                  <div>
                    <p className="text-sm text-(--color-text-secondary)">{t("invoices:creditNotes.reason")}</p>
                    <p className="font-medium">{creditNote.reason}</p>
                  </div>
                )}
              </div>

              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full min-w-125">
                  <thead className="bg-(--color-bg-secondary)">
                    <tr>
                      <th className="px-3 py-2 text-left text-sm font-medium text-(--color-text-secondary)">
                        {t("invoices:lines.description")}
                      </th>
                      <th className="px-3 py-2 text-center text-sm font-medium text-(--color-text-secondary) w-16">
                        {t("invoices:lines.quantity")}
                      </th>
                      <th className="px-3 py-2 text-right text-sm font-medium text-(--color-text-secondary) w-24">
                        {t("invoices:lines.unitPriceHt")}
                      </th>
                      <th className="px-3 py-2 text-center text-sm font-medium text-(--color-text-secondary) w-16">
                        {t("common:labels.vat")}
                      </th>
                      <th className="px-3 py-2 text-right text-sm font-medium text-(--color-text-secondary) w-24">
                        {t("invoices:lines.totalTtc")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-border)">
                    {creditNote.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2 text-sm">{line.description}</td>
                        <td className="px-3 py-2 text-center text-sm">{line.quantity}</td>
                        <td className="px-3 py-2 text-right text-sm">{formatCurrency(line.unit_price)}</td>
                        <td className="px-3 py-2 text-center text-sm">{line.tax_rate}%</td>
                        <td className="px-3 py-2 text-right text-sm font-medium">{formatCurrency(line.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex justify-end">
                <div className="w-full sm:w-64 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-(--color-text-secondary)">{t("invoices:fields.totalHt")}</span>
                    <span>{formatCurrency(creditNote.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-(--color-text-secondary)">{t("common:labels.vat")}</span>
                    <span>{formatCurrency(creditNote.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between text-base sm:text-lg font-bold border-t pt-2">
                    <span>{t("invoices:fields.totalTtc")}</span>
                    <span>{formatCurrency(creditNote.total)}</span>
                  </div>
                </div>
              </div>

              {creditNote.notes && (
                <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    {t("invoices:fields.notes")}
                  </p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">{creditNote.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("invoices:fields.client")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="font-medium text-sm">{creditNote.client?.name}</p>
              {creditNote.client?.email && (
                <p className="text-sm text-(--color-text-secondary) mt-2">{creditNote.client.email}</p>
              )}
              {creditNote.client?.phone && (
                <p className="text-sm text-(--color-text-secondary)">{creditNote.client.phone}</p>
              )}
            </CardContent>
          </Card>

          {creditNote.invoice_id && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("invoices:creditNotes.relatedInvoice")}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <button
                  onClick={() => router.push(`/invoices/${creditNote.invoice_id}`)}
                  className="flex items-center gap-2 text-sm text-primary-600 hover:underline"
                >
                  <FileText className="h-4 w-4" />
                  {creditNote.invoice?.invoice_number ?? t("common:buttons.view")}
                </button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <Undo2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">
                    {creditNote.restocked
                      ? t("invoices:creditNotes.stockRestored")
                      : t("invoices:creditNotes.stockNotRestored")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
