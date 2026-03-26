import { useState } from "react";
import { useParams, useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Pencil, ArrowRight, Mail, Truck } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  getQuoteStatusVariant,
  getStatusLabel,
  Modal,
} from "@/components/ui";
import { EmailDialog } from "@/components/email";
import { PDFViewer } from "@/features/pdf";
import { useQuote, useConvertQuoteToInvoice, useConvertQuoteToDeliveryNote } from "./hooks/useQuotes";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useCompanySettings } from "@/features/settings";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";

export function QuoteViewPage() {
  const { t } = useTranslation(["quotes", "common"]);
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);

  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { data: quote, isLoading } = useQuote(id ?? "");
  const { data: company } = useCompanySettings();
  const convertToInvoice = useConvertQuoteToInvoice();
  const convertToDeliveryNote = useConvertQuoteToDeliveryNote();

  if (isLoading || !quote) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const handleConvert = async () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    await convertToInvoice.mutateAsync(quote.id);
    setShowConvertModal(false);
    router.push("/invoices");
  };

  const handleConvertToDeliveryNote = async () => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    const deliveryNote = await convertToDeliveryNote.mutateAsync(quote.id);
    router.push(`/delivery-notes/${deliveryNote.id}`);
  };

  const handleSendEmail = () => {
    if (!quote.client?.email) {
      toast.error(t("quotes:noClientEmail"));
      return;
    }
    setShowEmailDialog(true);
  };

  const getEmailSubject = () => `${t("quotes:title")} ${quote.quote_number}`;

  const getEmailBody = () =>
    `${t("quotes:emailGreeting")},\n\n${t("quotes:emailBody", { number: quote.quote_number, amount: formatCurrency(quote.total), date: formatDate(quote.validity_date) })}\n\n${t("quotes:emailClosing")},\n${company?.company_name || ""}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/quotes")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("common:buttons.back")}
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-(--color-text-primary)">
                {quote.quote_number}
              </h1>
              <Badge variant={getQuoteStatusVariant(quote.status)}>
                {getStatusLabel(quote.status)}
              </Badge>
            </div>
            <p className="text-(--color-text-secondary) truncate">{quote.client?.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={handleSendEmail}>
            <Mail className="h-4 w-4 mr-2" />
            {t("quotes:actions.sendByEmail")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/quotes/${id}/edit`)}
          >
            <Pencil className="h-4 w-4 mr-2" />
            {t("common:buttons.edit")}
          </Button>
          {quote.status === "ACCEPTED" && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleConvertToDeliveryNote}
                isLoading={convertToDeliveryNote.isPending}
              >
                <Truck className="h-4 w-4 mr-2" />
                {t("quotes:createDeliveryNote")}
              </Button>
              <Button size="sm" onClick={() => setShowConvertModal(true)}>
                <ArrowRight className="h-4 w-4 mr-2" />
                {t("quotes:actions.convertToInvoice")}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("quotes:quoteDetails")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm text-(--color-text-secondary)">{t("quotes:fields.issueDate")}</p>
                  <p className="font-medium">{formatDate(quote.issue_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-(--color-text-secondary)">{t("quotes:fields.validityDate")}</p>
                  <p className="font-medium">{formatDate(quote.validity_date)}</p>
                </div>
              </div>

              {/* Mobile line items */}
              <div className="md:hidden space-y-3">
                {quote.lines.map((line) => (
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
                        {t("quotes:lines.description")}
                      </th>
                      <th className="px-3 py-2 text-center text-sm font-medium text-(--color-text-secondary) w-16">
                        {t("quotes:lines.quantity")}
                      </th>
                      <th className="px-3 py-2 text-right text-sm font-medium text-(--color-text-secondary) w-24">
                        {t("quotes:lines.unitPriceHt")}
                      </th>
                      <th className="px-3 py-2 text-center text-sm font-medium text-(--color-text-secondary) w-16">
                        {t("common:labels.vat")}
                      </th>
                      <th className="px-3 py-2 text-right text-sm font-medium text-(--color-text-secondary) w-24">
                        {t("quotes:lines.totalTtc")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-border)">
                    {quote.lines.map((line) => (
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
                    <span className="text-(--color-text-secondary)">{t("quotes:fields.totalHt")}</span>
                    <span>{formatCurrency(quote.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-(--color-text-secondary)">{t("common:labels.vat")}</span>
                    <span>{formatCurrency(quote.tax_amount)}</span>
                  </div>
                  <div className="flex justify-between text-base sm:text-lg font-bold border-t pt-2">
                    <span>{t("quotes:fields.totalTtc")}</span>
                    <span>{formatCurrency(quote.total)}</span>
                  </div>
                </div>
              </div>

              {quote.notes && (
                <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">{t("quotes:fields.notes")}</p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">{quote.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("quotes:fields.client")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="font-medium text-sm">{quote.client?.name}</p>
              {quote.client?.address && (
                <p className="text-sm text-(--color-text-secondary)">{quote.client.address}</p>
              )}
              {(quote.client?.postal_code || quote.client?.city) && (
                <p className="text-sm text-(--color-text-secondary)">
                  {quote.client.postal_code} {quote.client.city}
                </p>
              )}
              {quote.client?.email && (
                <p className="text-sm text-(--color-text-secondary) mt-2">{quote.client.email}</p>
              )}
              {quote.client?.phone && (
                <p className="text-sm text-(--color-text-secondary)">{quote.client.phone}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("quotes:pdfDocument")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {company && (
                <PDFViewer type="quote" document={quote} company={company} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal
        isOpen={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        title={t("quotes:actions.convertToInvoice")}
        size="sm"
      >
        <p className="text-(--color-text-secondary) mb-6">
          {t("quotes:confirmConvert")} <strong>{quote.quote_number}</strong>
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowConvertModal(false)}>
            {t("common:buttons.cancel")}
          </Button>
          <Button
            onClick={handleConvert}
            isLoading={convertToInvoice.isPending}
          >
            {t("common:buttons.confirm")}
          </Button>
        </div>
      </Modal>

      {/* Email Dialog */}
      {quote.client?.email && (
        <EmailDialog
          isOpen={showEmailDialog}
          onClose={() => setShowEmailDialog(false)}
          recipientEmail={quote.client.email}
          recipientName={quote.client.name}
          documentType="quote"
          documentNumber={quote.quote_number}
          defaultSubject={getEmailSubject()}
          defaultBody={getEmailBody()}
          companyName={company?.company_name}
        />
      )}
    </div>
  );
}
