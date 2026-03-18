import { useEffect } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Bell, AlertTriangle, Clock, FileText, Receipt, Check, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Button } from "@/components/ui";
import { usePendingReminders, useCheckAndCreateReminders, useMarkReminderSent, useSendReminderEmail } from "../hooks/useReminders";
import { formatDate } from "@/lib/utils";
import type { Reminder } from "@/types";

function getReminderIcon(type: string) {
  switch (type) {
    case "PAYMENT_DUE":
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case "QUOTE_EXPIRING":
      return <Clock className="h-4 w-4 text-orange-500" />;
    case "DELIVERY_SCHEDULED":
      return <FileText className="h-4 w-4 text-blue-500" />;
    default:
      return <Bell className="h-4 w-4 text-gray-500" />;
  }
}

function getDocumentLink(reminder: Reminder) {
  switch (reminder.document_type) {
    case "INVOICE":
      return `/invoices/${reminder.document_id}`;
    case "QUOTE":
      return `/quotes/${reminder.document_id}`;
    case "DELIVERY_NOTE":
      return `/delivery-notes/${reminder.document_id}`;
    default:
      return "#";
  }
}

function getDocumentIcon(type: string) {
  switch (type) {
    case "INVOICE":
      return <Receipt className="h-4 w-4" />;
    case "QUOTE":
      return <FileText className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

export function RemindersWidget() {
  const { t } = useTranslation("common");
  const { data: reminders, isLoading } = usePendingReminders();
  const checkAndCreate = useCheckAndCreateReminders();
  const markSent = useMarkReminderSent();
  const sendEmail = useSendReminderEmail();

  const getReminderLabel = (reminder: Reminder) => {
    switch (reminder.reminder_type) {
      case "PAYMENT_DUE":
        return t("reminders.paymentDue");
      case "QUOTE_EXPIRING":
        return t("reminders.quoteExpiring");
      case "DELIVERY_SCHEDULED":
        return t("reminders.deliveryScheduled");
      default:
        return reminder.message || t("reminders.reminder");
    }
  };

  const getDocumentTypeLabel = (type: string) => {
    switch (type) {
      case "INVOICE":
        return t("documents.invoice");
      case "QUOTE":
        return t("documents.quote");
      case "DELIVERY_NOTE":
        return t("documents.deliveryNote");
      default:
        return t("documents.document");
    }
  };

  // Check for new reminders on component mount
  useEffect(() => {
    checkAndCreate.mutate();
  }, []);

  const handleMarkDone = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await markSent.mutateAsync(id);
  };

  const handleSendEmail = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await sendEmail.mutateAsync(id);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-gray-500" />
            <CardTitle>{t("reminders.title")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-gray-500" />
            <CardTitle>{t("reminders.titleAlerts")}</CardTitle>
          </div>
          {reminders && reminders.length > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
              {reminders.length}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {reminders && reminders.length > 0 ? (
          <ul className="divide-y divide-gray-200">
            {reminders.slice(0, 5).map((reminder) => (
              <li key={reminder.id} className="py-3">
                <Link
                  href={getDocumentLink(reminder)}
                  className="flex items-start justify-between hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getReminderIcon(reminder.reminder_type)}</div>
                    <div>
                      <p className="font-medium text-sm text-gray-900">
                        {getReminderLabel(reminder)}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                        {getDocumentIcon(reminder.document_type)}
                        <span>{getDocumentTypeLabel(reminder.document_type)}</span>
                        <span className="text-gray-400">|</span>
                        <span>{formatDate(reminder.scheduled_date)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleSendEmail(reminder.id, e)}
                      disabled={sendEmail.isPending}
                      title={t("reminders.sendEmail")}
                    >
                      <Mail className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleMarkDone(reminder.id, e)}
                      className="shrink-0"
                      title={t("reminders.markAsDone")}
                    >
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-6">
            <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">{t("reminders.noReminders")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
