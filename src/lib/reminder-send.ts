import { prisma } from "@/lib/db";
import {
  sendEmail,
  isResendConfigured,
  paymentOverdueEmail,
  quoteExpiringEmail,
  paymentOverdueEmailPlainText,
  quoteExpiringEmailPlainText,
} from "@/lib/email";
import { DEFAULT_CURRENCY } from "@/lib/currencies";

/**
 * Reminder emails, shared by the user's "send" button
 * (/api/reminders/[id]/send) and the nightly automatic sending
 * (/api/cron/reminders). Permissions are the caller's business: the button
 * checks the user's, the job runs only for tenants that turned it on.
 */

export type ReminderMail =
  | { ok: true; to: string; html: { subject: string; html: string }; text: { subject: string; body: string }; replyTo?: string }
  | { ok: false; status: number; error: string };

interface ReminderRef {
  id: string;
  tenantId: string;
  documentType: string;
  documentId: string;
}

export async function buildReminderMail(reminder: ReminderRef): Promise<ReminderMail> {
  const { tenantId } = reminder;
  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const companyName = settings?.companyName || "My Company";
  const currency = settings?.currency || DEFAULT_CURRENCY;
  const replyTo = settings?.email || undefined;

  if (reminder.documentType === "invoice") {
    const invoice = await prisma.invoice.findFirst({
      where: { tenantId, id: reminder.documentId },
      include: { client: true },
    });
    if (!invoice?.client?.email) return { ok: false, status: 400, error: "Client has no email address" };
    const params = {
      companyName,
      clientName: invoice.client.name,
      invoiceNumber: invoice.invoiceNumber,
      total: Number(invoice.total),
      currency,
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().split("T")[0] : "N/A",
    };
    return { ok: true, to: invoice.client.email, html: paymentOverdueEmail(params), text: paymentOverdueEmailPlainText(params), replyTo };
  }

  if (reminder.documentType === "quote") {
    const quote = await prisma.quote.findFirst({
      where: { tenantId, id: reminder.documentId },
      include: { client: true },
    });
    if (!quote?.client?.email) return { ok: false, status: 400, error: "Client has no email address" };
    const params = {
      companyName,
      clientName: quote.client.name,
      quoteNumber: quote.quoteNumber,
      total: Number(quote.total),
      currency,
      validityDate: quote.validityDate ? quote.validityDate.toISOString().split("T")[0] : "N/A",
    };
    return { ok: true, to: quote.client.email, html: quoteExpiringEmail(params), text: quoteExpiringEmailPlainText(params), replyTo };
  }

  return { ok: false, status: 400, error: `Unsupported document type: ${reminder.documentType}` };
}

/** Send through the mail provider and mark the reminder sent. */
export async function deliverReminder(reminder: ReminderRef, mail: Extract<ReminderMail, { ok: true }>) {
  await sendEmail({ to: mail.to, subject: mail.html.subject, html: mail.html.html, replyTo: mail.replyTo });
  return prisma.reminder.update({ where: { id: reminder.id }, data: { sentAt: new Date() } });
}

/**
 * Send every due, unsent reminder of a tenant (automatic mode). A reminder
 * whose client has no email stays pending, for the user to handle. Returns
 * how many were sent.
 */
export async function sendDueReminders(tenantId: string): Promise<{ sent: number; skipped: number }> {
  if (!isResendConfigured()) return { sent: 0, skipped: 0 };
  const due = await prisma.reminder.findMany({
    where: {
      tenantId,
      sentAt: null,
      scheduledDate: { lte: new Date() },
      reminderType: { in: ["payment_overdue", "quote_expiring"] },
    },
  });
  let sent = 0;
  let skipped = 0;
  for (const reminder of due) {
    const mail = await buildReminderMail(reminder);
    if (!mail.ok) {
      skipped++;
      continue;
    }
    await deliverReminder(reminder, mail);
    sent++;
  }
  return { sent, skipped };
}
