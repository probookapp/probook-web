import { useState } from "react";
import { useParams, useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Pencil, CheckCircle, Send, ShieldCheck, ShieldAlert, Truck, Mail } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  getInvoiceStatusVariant,
  getStatusLabel,
} from "@/components/ui";
import { EmailDialog } from "@/components/email";
import { PDFViewer } from "@/features/pdf";
import { PaymentsList } from "./components";
import { useInvoice, useMarkInvoicePaid, useIssueInvoice, useVerifyInvoiceIntegrity, useConvertInvoiceToDeliveryNote } from "./hooks/useInvoices";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useCompanySettings } from "@/features/settings";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";

export function InvoiceViewPage() {
  const { t } = useTranslation(["invoices", "common"]);
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [showEmailDialog, setShowEmailDialog] = useState(false);

  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { data: invoice, isLoading } = useInvoice(id ?? "");
  const { data: company } = useCompanySettings();
  const { data: isIntegrityValid } = useVerifyInvoiceIntegrity(id ?? "");
  const markPaid = useMarkInvoicePaid();
  const issueInvoice = useIssueInvoice();
  const convertToDeliveryNote = useConvertInvoiceToDeliveryNote();

  if (isLoading || !invoice) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const handleMarkPaid = async () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    await markPaid.mutateAsync(invoice.id);
  };

  const handleIssue = async () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    await issueInvoice.mutateAsync(invoice.id);
  };

  const handleConvertToDeliveryNote = async () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    const deliveryNote = await convertToDeliveryNote.mutateAsync(invoice.id);
    router.push(`/delivery-notes/${deliveryNote.id}`);
  };

  const handleSendEmail = () => {
    if (!invoice.client?.email) {
      toast.error(t("invoices:noClientEmail"));
      return;
    }
    setShowEmailDialog(true);
  };

  const getEmailSubject = () => `${t("invoices:title")} ${invoice.invoice_number}`;

  const getEmailBody = () =>
    `${t("invoices:emailGreeting")},\n\n${t("invoices:emailBody", { number: invoice.invoice_number, amount: formatCurrency(invoice.total), date: formatDate(invoice.due_date) })}\n\n${t("invoices:emailClosing")},\n${company?.company_name || ""}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/invoices")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("common:buttons.back")}
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-(--color-text-primary)">
                {invoice.invoice_number}
              </h1>
              <Badge variant={getInvoiceStatusVariant(invoice.status)}>
                {getStatusLabel(invoice.status)}
              </Badge>
            </div>
            <p className="text-(--color-text-secondary) truncate">{invoice.client?.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.status === "DRAFT" && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/invoices/${id}/edit`)}
              >
                <Pencil className="h-4 w-4 mr-2" />
                {t("common:buttons.edit")}
              </Button>
              <Button size="sm" onClick={handleIssue} isLoading={issueInvoice.isPending}>
                <Send className="h-4 w-4 mr-2" />
                {t("invoices:actions.markAsIssued")}
              </Button>
            </>
          )}
          {invoice.status === "ISSUED" && (
            <>
              <Button variant="secondary" size="sm" onClick={handleSendEmail}>
                <Mail className="h-4 w-4 mr-2" />
                {t("invoices:actions.sendByEmail")}
              </Button>
              <Button size="sm" onClick={handleMarkPaid} isLoading={markPaid.isPending}>
                <CheckCircle className="h-4 w-4 mr-2" />
                {t("invoices:actions.markAsPaid")}
              </Button>
            </>
          )}
          {invoice.status !== "DRAFT" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleConvertToDeliveryNote}
              isLoading={convertToDeliveryNote.isPending}
            >
              <Truck className="h-4 w-4 mr-2" />
              {t("invoices:actions.createDeliveryNote")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("invoices:invoiceDetails")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-(--color-text-secondary)">{t("invoices:fields.issueDate")}</p>
                  <p className="font-medium">{formatDate(invoice.issue_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-(--color-text-secondary)">{t("invoices:fields.dueDate")}</p>
                  <p className="font-medium">{formatDate(invoice.due_date)}</p>
                </div>
              </div>

              {/* Mobile line items */}
              <div className="md:hidden space-y-3">
                {invoice.lines.map((line) => (
                  <div key={line.id} className="border rounded-lg p-3 bg-(--color-bg-secondary)">
                    <p className="text-sm font-medium">{line.description}</p>
                    <div className="flex items-center justify-between mt-1.5 text-sm text-(--color-text-secondary)">
                      <span>{line.quantity} × {formatCurrency(line.unit_price)} HT</span>
                      <span>{line.tax_rate}% {t("common:labels.vat")}</span>
                    </div>
                    <div className="flex justify-end mt-1">
                      <span className="text-sm font-medium">{formatCurrency(line.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop line items table */}
              <div className="hidden md:block border rounded-lg overflow-x-auto">
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
                    {invoice.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2 text-sm">{line.description}</td>
                        <td className="px-3 py-2 text-center text-sm">{line.quantity}</td>
                        <td className="px-3 py-2 text-right text-sm">
                          {formatCurrency(line.unit_price)}
                        </td>
                        <td className="px-3 py-2 text-center text-sm">{line.tax_rate}%</td>
                        <td className="px-3 py-2 text-right text-sm font-medium">
                          {formatCurrency(line.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex justify-end">
                <div className="w-full sm:w-64 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-(--color-text-secondary)">{t("invoices:fields.totalHt")}</span>
                    <span>{formatCurrency(invoice.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-(--color-text-secondary)">{t("common:labels.vat")}</span>
                    <span>{formatCurrency(invoice.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between text-base sm:text-lg font-bold border-t pt-2">
                    <span>{t("invoices:fields.totalTtc")}</span>
                    <span>{formatCurrency(invoice.total)}</span>
                  </div>
                </div>
              </div>

              {invoice.notes && (
                <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">{t("invoices:fields.notes")}</p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">{invoice.notes}</p>
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
              <p className="font-medium text-sm">{invoice.client?.name}</p>
              {invoice.client?.address && (
                <p className="text-sm text-(--color-text-secondary)">{invoice.client.address}</p>
              )}
              {(invoice.client?.postal_code || invoice.client?.city) && (
                <p className="text-sm text-(--color-text-secondary)">
                  {invoice.client.postal_code} {invoice.client.city}
                </p>
              )}
              {invoice.client?.email && (
                <p className="text-sm text-(--color-text-secondary) mt-2">{invoice.client.email}</p>
              )}
              {invoice.client?.phone && (
                <p className="text-sm text-(--color-text-secondary)">{invoice.client.phone}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("invoices:pdfDocument")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {company && (
                <PDFViewer type="invoice" document={invoice} company={company} />
              )}
            </CardContent>
          </Card>

          <PaymentsList invoice={invoice} />

          {invoice.integrity_hash && (
            <Card>
              <CardHeader>
                <CardTitle>{t("invoices:documentIntegrity")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  {isIntegrityValid ? (
                    <>
                      <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                        <ShieldCheck className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-green-700 dark:text-green-300">{t("invoices:integrityValid")}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {t("invoices:signatureValid")}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                        <ShieldAlert className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <p className="font-medium text-red-700 dark:text-red-300">{t("invoices:integrityInvalid")}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {t("invoices:documentModified")}
                        </p>
                      </div>
                    </>
                  )}
                </div>
                <p className="mt-3 text-xs text-gray-400 font-mono break-all">
                  Hash: {invoice.integrity_hash.slice(0, 32)}...
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Email Dialog */}
      {invoice.client?.email && (
        <EmailDialog
          isOpen={showEmailDialog}
          onClose={() => setShowEmailDialog(false)}
          recipientEmail={invoice.client.email}
          recipientName={invoice.client.name}
          documentType="invoice"
          documentNumber={invoice.invoice_number}
          defaultSubject={getEmailSubject()}
          defaultBody={getEmailBody()}
          companyName={company?.company_name}
        />
      )}
    </div>
  );
}
