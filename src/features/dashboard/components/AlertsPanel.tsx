import { useEffect } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, FileText, AlertCircle, ChevronRight, X, Bell, Mail, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { useAlertsSummary, useMarkQuoteExpired } from "../hooks/useAlerts";
import {
  usePendingReminders,
  useCheckAndCreateReminders,
  useMarkReminderSent,
  useSendReminderEmail,
} from "@/features/reminders/hooks/useReminders";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { formatCurrency } from "@/lib/utils";
import type { Alert, Reminder } from "@/types";

/**
 * One panel, not two.
 *
 * The dashboard used to carry an "Alerts" panel and a "Reminders" panel side by
 * side. They ran the same two queries — issued invoices past their due date,
 * sent quotes inside their last week — so every overdue invoice was announced
 * twice, under titles that were anagrams of each other. What differed was only
 * the verbs: alerts could be opened, reminders could be chased and closed.
 *
 * So the events are computed live (a stored list drifts; a query cannot), and
 * the reminder row behind each event supplies the actions. The reminders table
 * keeps its job — recording what was sent and what was dealt with — it just
 * stops being a second list of the same facts.
 */

function AlertItem({
  alert,
  onMarkExpired,
  reminder,
  onSend,
  onDone,
  busy,
}: {
  alert: Alert;
  onMarkExpired?: (id: string) => void;
  /** The pending reminder for this document, when the sweep has raised one. */
  reminder?: Reminder;
  onSend?: (reminderId: string) => void;
  onDone?: (reminderId: string) => void;
  busy?: boolean;
}) {
  const { t: tc } = useTranslation("common");
  const { t } = useTranslation("dashboard");

  const getAlertMessage = () => {
    const days = Math.abs(alert.days);
    switch (alert.alert_type) {
      case "OVERDUE_INVOICE":
        return t("alerts.messageOverdue", { days });
      case "DUE_SOON":
        return t("alerts.messageDueSoon", { days });
      case "EXPIRING_QUOTE":
        return t("alerts.messageExpiring", { days });
      case "EXPIRED_QUOTE":
        return t("alerts.messageExpired", { days });
      default:
        return alert.message;
    }
  };

  const getIcon = () => {
    switch (alert.alert_type) {
      case "OVERDUE_INVOICE":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "DUE_SOON":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "EXPIRING_QUOTE":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "EXPIRED_QUOTE":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500 dark:text-gray-400" />;
    }
  };

  const getSeverityClass = () => {
    switch (alert.severity) {
      case "danger":
        return "border-l-red-500 bg-red-50 dark:bg-red-900/20";
      case "warning":
        return "border-l-amber-500 bg-amber-50 dark:bg-amber-900/20";
      default:
        return "border-l-blue-500 bg-blue-50 dark:bg-blue-900/20";
    }
  };

  const getDocumentPath = () => {
    return alert.document_type === "invoice"
      ? `/invoices/${alert.document_id}`
      : `/quotes/${alert.document_id}`;
  };

  return (
    <div className={`p-3 border-l-4 rounded-r-lg ${getSeverityClass()}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{getIcon()}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={getDocumentPath()}
              className="font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400"
            >
              {alert.document_number}
            </Link>
            {alert.severity === "danger" && (
              <Badge variant="danger" className="text-xs">{t("alerts.urgent")}</Badge>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{alert.client_name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{getAlertMessage()}</p>
          {alert.amount && (
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">
              {formatCurrency(alert.amount)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={getDocumentPath()}
            className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            aria-label={t("alerts.viewDetails")}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
          {reminder && onSend && (
            <button
              onClick={() => onSend(reminder.id)}
              disabled={busy}
              className="p-1 text-gray-400 hover:text-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={tc("reminders.sendEmail")}
              aria-label={tc("reminders.sendEmail")}
            >
              <Mail className="h-4 w-4" />
            </button>
          )}
          {reminder && onDone && (
            <button
              onClick={() => onDone(reminder.id)}
              disabled={busy}
              className="p-1 text-gray-400 hover:text-success-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={tc("reminders.markAsDone")}
              aria-label={tc("reminders.markAsDone")}
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          {alert.alert_type === "EXPIRED_QUOTE" && onMarkExpired && (
            <button
              onClick={() => onMarkExpired(alert.document_id)}
              className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={t("alerts.markExpired")}
              aria-label={t("alerts.markExpired")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AlertsPanel() {
  const locale = useLocale();
  const { t } = useTranslation("dashboard");
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { data: alerts, isLoading } = useAlertsSummary();
  const markExpired = useMarkQuoteExpired();

  const { data: reminders } = usePendingReminders();
  const checkAndCreate = useCheckAndCreateReminders();
  const markSent = useMarkReminderSent();
  const sendEmail = useSendReminderEmail();

  // Raise reminders for anything newly due, so the actions below have a row to
  // act on. The sweep is idempotent, so landing on the dashboard twice is free.
  useEffect(() => {
    if (!isDemoMode) checkAndCreate.mutate();
  }, [isDemoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // An alert and its reminder describe the same document, which is what lets
  // one line carry both the fact and the actions.
  const reminderFor = new Map((reminders ?? []).map((r) => [r.document_id, r]));

  const busy = markSent.isPending || sendEmail.isPending;

  const guard = (run: (id: string) => void) => (id: string) => {
    if (isDemoMode) {
      showSubscribePrompt();
      return;
    }
    run(id);
  };

  const itemProps = (alert: Alert) => ({
    reminder: reminderFor.get(alert.document_id),
    onSend: guard((id: string) => sendEmail.mutate(id)),
    onDone: guard((id: string) => markSent.mutate(id)),
    busy,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t("alerts.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasAlerts = alerts && alerts.total_count > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t("alerts.title")}
            {hasAlerts && (
              <Badge variant="danger">{alerts.total_count}</Badge>
            )}
          </CardTitle>
          {alerts && alerts.total_overdue_amount > 0 && (
            <span className="text-sm text-red-600 dark:text-red-400 font-medium">
              {formatCurrency(alerts.total_overdue_amount)} {t("alerts.overdue")}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!hasAlerts ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
            <p className="text-sm">{t("alerts.noAlerts")}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{t("alerts.allGood")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Overdue Invoices */}
            {alerts.overdue_invoices.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  {t("alerts.overdueInvoices", { count: alerts.overdue_invoices.length })}
                </h4>
                <div className="space-y-2">
                  {alerts.overdue_invoices.slice(0, 3).map((alert) => (
                    <AlertItem key={alert.id} alert={alert} {...itemProps(alert)} />
                  ))}
                  {alerts.overdue_invoices.length > 3 && (
                    <Link
                      href={`/${locale}/invoices?status=overdue`}
                      className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                    >
                      {t("alerts.viewMore", { count: alerts.overdue_invoices.length - 3 })}
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Due Soon Invoices */}
            {alerts.due_soon_invoices.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  {t("alerts.dueSoonInvoices", { count: alerts.due_soon_invoices.length })}
                </h4>
                <div className="space-y-2">
                  {alerts.due_soon_invoices.slice(0, 3).map((alert) => (
                    <AlertItem key={alert.id} alert={alert} {...itemProps(alert)} />
                  ))}
                </div>
              </div>
            )}

            {/* Expiring Quotes */}
            {alerts.expiring_quotes.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-500" />
                  {t("alerts.expiringQuotes", { count: alerts.expiring_quotes.length })}
                </h4>
                <div className="space-y-2">
                  {alerts.expiring_quotes.slice(0, 3).map((alert) => (
                    <AlertItem key={alert.id} alert={alert} {...itemProps(alert)} />
                  ))}
                </div>
              </div>
            )}

            {/* Expired Quotes */}
            {alerts.expired_quotes.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  {t("alerts.expiredQuotes", { count: alerts.expired_quotes.length })}
                </h4>
                <div className="space-y-2">
                  {alerts.expired_quotes.slice(0, 3).map((alert) => (
                    <AlertItem
                      key={alert.id}
                      alert={alert}
                      onMarkExpired={guard((id) => markExpired.mutate(id))}
                      {...itemProps(alert)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
