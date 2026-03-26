import { useState } from "react";
import { useParams, useRouter } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "@/stores/useToastStore";
import {
  ArrowLeft,
  Pencil,
  Copy,
  Truck,
  CheckCircle,
  FileText,
  Mail,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from "@/components/ui";
import { EmailDialog } from "@/components/email";
import {
  useDeliveryNote,
  useUpdateDeliveryNote,
  useDuplicateDeliveryNote,
  useConvertDeliveryNoteToInvoice,
} from "./hooks/useDeliveryNotes";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useCompanySettings, useLogoBase64 } from "@/features/settings/hooks/useSettings";
import { PDFViewer } from "../pdf/PDFViewer";
import { formatDate } from "@/lib/utils";
import type { DeliveryNoteStatus } from "@/types";

export function DeliveryNoteViewPage() {
  const { t } = useTranslation(["delivery", "common"]);
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [showEmailDialog, setShowEmailDialog] = useState(false);

  const statusConfig: Record<
    DeliveryNoteStatus,
    { label: string; variant: "default" | "success" | "warning" | "danger" | "info" }
  > = {
    DRAFT: { label: t("delivery:status.DRAFT"), variant: "default" },
    DELIVERED: { label: t("delivery:status.DELIVERED"), variant: "success" },
    CANCELLED: { label: t("delivery:status.CANCELLED"), variant: "danger" },
  };

  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { data: deliveryNote, isLoading } = useDeliveryNote(id || "");
  const { data: company } = useCompanySettings();
  const { data: logoBase64 } = useLogoBase64();
  const updateDeliveryNote = useUpdateDeliveryNote();
  const duplicateDeliveryNote = useDuplicateDeliveryNote();
  const convertToInvoice = useConvertDeliveryNoteToInvoice();

  const handleMarkDelivered = async () => {
    if (!deliveryNote) return;
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      await updateDeliveryNote.mutateAsync({
        id: deliveryNote.id,
        client_id: deliveryNote.client_id,
        quote_id: deliveryNote.quote_id,
        invoice_id: deliveryNote.invoice_id,
        issue_date: deliveryNote.issue_date,
        delivery_date: new Date().toISOString().split("T")[0],
        delivery_address: deliveryNote.delivery_address,
        notes: deliveryNote.notes,
        status: "DELIVERED",
        lines: deliveryNote.lines.map((l) => ({
          product_id: l.product_id,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
        })),
      });
    } catch {
      // Error is handled by TanStack Query
    }
  };

  const handleDuplicate = async () => {
    if (!deliveryNote) return;
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      const newNote = await duplicateDeliveryNote.mutateAsync(deliveryNote.id);
      router.push(`/delivery-notes/${newNote.id}/edit`);
    } catch {
      // Error is handled by TanStack Query
    }
  };

  const handleConvertToInvoice = async () => {
    if (!deliveryNote) return;
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      const invoice = await convertToInvoice.mutateAsync(deliveryNote.id);
      router.push(`/invoices/${invoice.id}`);
    } catch {
      // Error is handled by TanStack Query
    }
  };

  const handleSendEmail = () => {
    if (!deliveryNote?.client?.email) {
      toast.error(t("delivery:noClientEmail"));
      return;
    }
    setShowEmailDialog(true);
  };

  const getEmailSubject = () => `${t("delivery:title")} ${deliveryNote?.delivery_note_number}`;

  const getEmailBody = () =>
    `${t("delivery:emailGreeting")},\n\n${t("delivery:emailBody", { number: deliveryNote?.delivery_note_number })}\n\n${t("delivery:emailClosing")},\n${company?.company_name || ""}`;

  if (isLoading || !deliveryNote) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/delivery-notes")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("common:buttons.back")}
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-(--color-text-primary)">
                {deliveryNote.delivery_note_number}
              </h1>
              <Badge variant={statusConfig[deliveryNote.status].variant}>
                <Truck className="h-3 w-3 mr-1" />
                {statusConfig[deliveryNote.status].label}
              </Badge>
            </div>
            <p className="text-(--color-text-secondary) text-sm">
              {t("delivery:createdOn")} {formatDate(deliveryNote.created_at)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {deliveryNote.status === "DRAFT" && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleMarkDelivered}
                isLoading={updateDeliveryNote.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {t("delivery:actions.markAsDelivered")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/delivery-notes/${deliveryNote.id}/edit`)}
              >
                <Pencil className="h-4 w-4 mr-2" />
                {t("delivery:actions.edit")}
              </Button>
            </>
          )}
          <Button variant="secondary" size="sm" onClick={handleSendEmail}>
            <Mail className="h-4 w-4 mr-2" />
            {t("delivery:actions.sendByEmail")}
          </Button>
          {deliveryNote.status === "DELIVERED" && !deliveryNote.invoice_id && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleConvertToInvoice}
              isLoading={convertToInvoice.isPending}
            >
              <FileText className="h-4 w-4 mr-2" />
              {t("delivery:actions.createInvoice")}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleDuplicate}>
            <Copy className="h-4 w-4 mr-2" />
            {t("delivery:actions.duplicate")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* PDF Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("common:pdfViewer.title")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {company && (
              <PDFViewer
                type="delivery_note"
                document={deliveryNote}
                company={company}
                logoBase64={logoBase64}
              />
            )}
          </CardContent>
        </Card>

        {/* Client Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("delivery:fields.client")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{deliveryNote.client?.name}</p>
            {deliveryNote.client?.address && (
              <p className="text-sm text-(--color-text-secondary)">{deliveryNote.client.address}</p>
            )}
            {(deliveryNote.client?.postal_code || deliveryNote.client?.city) && (
              <p className="text-sm text-(--color-text-secondary)">
                {deliveryNote.client?.postal_code} {deliveryNote.client?.city}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Dates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("common:dates")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-(--color-text-secondary)">{t("delivery:fields.issueDate")}:</span>
              <span className="font-medium">{formatDate(deliveryNote.issue_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-(--color-text-secondary)">{t("delivery:fields.deliveryDate")}:</span>
              <span className="font-medium">
                {deliveryNote.delivery_date
                  ? formatDate(deliveryNote.delivery_date)
                  : "-"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Address */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("delivery:fields.deliveryAddress")}</CardTitle>
          </CardHeader>
          <CardContent>
            {deliveryNote.delivery_address ? (
              <p className="text-sm text-(--color-text-secondary) whitespace-pre-wrap">
                {deliveryNote.delivery_address}
              </p>
            ) : (
              <p className="text-sm text-(--color-text-muted)">{t("delivery:clientAddress")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("delivery:lines.title")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile line items */}
          <div className="md:hidden divide-y divide-(--color-border)">
            {deliveryNote.lines.map((line) => (
              <div key={line.id} className="px-4 py-3">
                <p className="text-sm font-medium">{line.description}</p>
                <div className="flex items-center gap-3 mt-1 text-sm text-(--color-text-secondary)">
                  <span>{line.quantity}</span>
                  <span>{line.unit || "-"}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop line items table */}
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-80">
            <thead className="bg-(--color-bg-secondary) border-b border-(--color-border)">
              <tr>
                <th className="text-left py-2 px-3 text-sm font-medium text-(--color-text-secondary)">
                  {t("delivery:lines.description")}
                </th>
                <th className="text-right py-2 px-3 text-sm font-medium text-(--color-text-secondary) w-20">
                  {t("delivery:lines.quantity")}
                </th>
                <th className="text-left py-2 px-3 text-sm font-medium text-(--color-text-secondary) w-20">
                  {t("delivery:lines.unit")}
                </th>
              </tr>
            </thead>
            <tbody>
              {deliveryNote.lines.map((line, index) => (
                <tr key={line.id} className={index % 2 === 1 ? "bg-(--color-bg-secondary)" : ""}>
                  <td className="py-2 px-3 text-sm">{line.description}</td>
                  <td className="py-2 px-3 text-sm text-right">{line.quantity}</td>
                  <td className="py-2 px-3 text-sm">{line.unit || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {deliveryNote.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("delivery:fields.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-(--color-text-secondary) whitespace-pre-wrap">
              {deliveryNote.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Email Dialog */}
      {deliveryNote.client?.email && (
        <EmailDialog
          isOpen={showEmailDialog}
          onClose={() => setShowEmailDialog(false)}
          recipientEmail={deliveryNote.client.email}
          recipientName={deliveryNote.client.name}
          documentType="delivery_note"
          documentNumber={deliveryNote.delivery_note_number}
          defaultSubject={getEmailSubject()}
          defaultBody={getEmailBody()}
          companyName={company?.company_name}
        />
      )}
    </div>
  );
}
