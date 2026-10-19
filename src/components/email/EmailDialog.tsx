import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Mail, User, FileText, Edit2 } from "lucide-react";
import { Button, Input, Textarea, Modal, ModalFooter } from "@/components/ui";

interface EmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  recipientEmail: string;
  recipientName?: string;
  documentType: "invoice" | "quote" | "delivery_note";
  documentNumber: string;
  defaultSubject: string;
  defaultBody: string;
  companyName?: string;
}

/**
 * The message that goes with a document, opened in the user's own mail app.
 *
 * Built on the shared Modal like every other dialog: it used to be a panel of
 * its own, with no Escape, no focus kept inside, no bottom sheet on a phone,
 * colours that ignored the theme — and a client's e-mail address, one long
 * word, pushed it sideways.
 */
export function EmailDialog({
  isOpen,
  onClose,
  recipientEmail,
  recipientName,
  documentType,
  documentNumber,
  defaultSubject,
  defaultBody,
  companyName,
}: EmailDialogProps) {
  const { t } = useTranslation("common");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [isEditing, setIsEditing] = useState(false);
  const [prevKey, setPrevKey] = useState({ defaultSubject, defaultBody, isOpen });

  if (prevKey.defaultSubject !== defaultSubject || prevKey.defaultBody !== defaultBody || prevKey.isOpen !== isOpen) {
    setPrevKey({ defaultSubject, defaultBody, isOpen });
    setSubject(defaultSubject);
    setBody(defaultBody);
    setIsEditing(false);
  }

  const getDocumentTypeLabel = () => {
    switch (documentType) {
      case "invoice":
        return t("documents.invoice");
      case "quote":
        return t("documents.quote");
      case "delivery_note":
        return t("documents.deliveryNote");
    }
  };

  const handleSend = () => {
    const mailtoSubject = encodeURIComponent(subject);
    const mailtoBody = encodeURIComponent(body);
    window.open(`mailto:${recipientEmail}?subject=${mailtoSubject}&body=${mailtoBody}`);
    onClose();
  };

  // A rewritten message is not thrown away by a stray click outside.
  const isDirty = subject !== defaultSubject || body !== defaultBody;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("email.sendByEmail")} size="xl" isDirty={isDirty}>
      <div className="space-y-4 sm:space-y-6">
        {/* Recipient */}
        <div className="flex items-center gap-3 sm:gap-4 rounded-lg bg-(--color-bg-secondary) p-3 sm:p-4">
          <div className="shrink-0 rounded-full bg-(--color-bg-tertiary) p-2">
            <User className="h-5 w-5 text-(--color-text-secondary)" />
          </div>
          <div className="min-w-0 wrap-anywhere">
            <p className="font-medium text-(--color-text-primary)">{recipientName || t("labels.client")}</p>
            <p className="text-sm text-(--color-text-secondary)">{recipientEmail}</p>
          </div>
        </div>

        {/* Document */}
        <div className="flex items-center gap-3 sm:gap-4 rounded-lg border border-(--color-border-primary) p-3 sm:p-4">
          <div className="shrink-0 rounded-lg bg-primary-50 p-2 dark:bg-primary-950">
            <FileText className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0 wrap-anywhere">
            <p className="font-medium text-(--color-text-primary)">
              {getDocumentTypeLabel()} {documentNumber}
            </p>
            <p className="text-sm text-(--color-text-secondary)">{t("email.pdfAutoAttached")}</p>
          </div>
        </div>

        {/* Message */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-(--color-text-primary)">{t("email.message")}</span>
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="flex min-h-9 shrink-0 items-center gap-1 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            <Edit2 className="h-4 w-4" />
            {isEditing ? t("email.preview") : t("email.editMessage")}
          </button>
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <Input label={t("email.subject")} value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Textarea
              label={t("email.body")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-50"
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-(--color-border-primary)">
            <div className="border-b border-(--color-border-primary) bg-(--color-bg-secondary) px-4 py-2">
              <p className="text-sm wrap-anywhere">
                <span className="text-(--color-text-secondary)">{t("email.subjectLabel")}</span>{" "}
                <span className="font-medium text-(--color-text-primary)">{subject}</span>
              </p>
            </div>
            <div className="p-4">
              <pre className="whitespace-pre-wrap wrap-anywhere font-sans text-sm text-(--color-text-primary)">{body}</pre>
            </div>
            {companyName && (
              <div className="border-t border-(--color-border-primary) bg-(--color-bg-secondary) px-4 py-2">
                <p className="text-xs text-(--color-text-secondary) wrap-anywhere">
                  {t("email.sentFrom")} {companyName}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Hint */}
        <div className="flex items-start gap-3 rounded-lg bg-amber-50 p-3 sm:p-4 dark:bg-amber-900/30">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="min-w-0 text-sm text-amber-800 dark:text-amber-200">
            <strong>{t("labels.note")}:</strong> {t("email.note")}
          </p>
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("buttons.cancel")}
          </Button>
          <Button onClick={handleSend}>
            <Send className="h-4 w-4 me-2" />
            {t("email.send")}
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
