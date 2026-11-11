import { prisma } from "./db";

/**
 * Server-side reminder sweep, shared by the dashboard-triggered
 * /api/reminders/check-and-create route (single tenant, user session) and the
 * /api/cron/reminders job (all tenants, no session).
 *
 * Idempotent: a document only gets a new reminder when it has no pending
 * (sentAt: null) reminder of the same type, so running the sweep twice never
 * duplicates. Sending is not done here: reminders go out through the user's
 * /api/reminders/[id]/send button, or, for tenants that turned on automatic
 * sending, through the nightly job (src/lib/reminder-send.ts).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const DEFAULT_REMINDER_STEPS = [1, 15, 30];

/** "1, 15, 30" into [1, 15, 30]: positive whole days, ascending, no repeats. */
export function parseReminderSteps(value: string | null | undefined): number[] {
  const steps = [...new Set(
    (value ?? "")
      .split(/[,;\s]+/)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n > 0 && n <= 365)
  )].sort((a, b) => a - b);
  return steps.length ? steps : DEFAULT_REMINDER_STEPS;
}

/**
 * Whether an overdue invoice is due its next reminder: the n-th reminder
 * waits until the invoice is steps[n] days late, and after the last step
 * there are no more. Without this, a reminder sent today was followed by a
 * new pending one tomorrow, and every day after.
 */
export function isNextReminderDue(daysOverdue: number, alreadySent: number, steps: number[]): boolean {
  return alreadySent < steps.length && daysOverdue >= steps[alreadySent];
}

/** Create due reminders for one tenant. Returns the newly created reminders. */
export async function sweepTenantReminders(tenantId: string) {
  const now = new Date();
  const created: Awaited<ReturnType<typeof prisma.reminder.create>>[] = [];
  const settings = await prisma.companySettings.findFirst({
    where: { tenantId },
    select: { reminderSteps: true },
  });
  const steps = parseReminderSteps(settings?.reminderSteps);

  // Overdue invoices, with their reminders read in two grouped queries rather
  // than two per invoice: the nightly job runs this for every account.
  const overdueInvoices = await prisma.invoice.findMany({
    where: { tenantId, status: "ISSUED", dueDate: { lt: now } },
    select: { id: true, invoiceNumber: true, dueDate: true },
  });
  const invoiceIds = overdueInvoices.map((i) => i.id);
  const [pendingInvoiceRows, sentInvoiceRows] = invoiceIds.length
    ? await Promise.all([
        prisma.reminder.findMany({
          where: { tenantId, documentType: "invoice", reminderType: "payment_overdue", sentAt: null, documentId: { in: invoiceIds } },
          select: { documentId: true },
        }),
        prisma.reminder.groupBy({
          by: ["documentId"],
          where: { tenantId, documentType: "invoice", reminderType: "payment_overdue", sentAt: { not: null }, documentId: { in: invoiceIds } },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const pendingInvoices = new Set(pendingInvoiceRows.map((r) => r.documentId));
  const sentCount = new Map(sentInvoiceRows.map((r) => [r.documentId, r._count._all]));

  for (const invoice of overdueInvoices) {
    if (pendingInvoices.has(invoice.id)) continue;
    const daysOverdue = Math.floor((now.getTime() - invoice.dueDate.getTime()) / MS_PER_DAY);
    if (!isNextReminderDue(daysOverdue, sentCount.get(invoice.id) ?? 0, steps)) continue;
    created.push(
      await prisma.reminder.create({
        data: {
          tenantId,
          reminderType: "payment_overdue",
          documentType: "invoice",
          documentId: invoice.id,
          scheduledDate: now,
          message: `Payment overdue for invoice ${invoice.invoiceNumber}`,
        },
      })
    );
  }

  // Quotes nearing expiry (within 7 days): one reminder per quote. Any
  // earlier one, sent or not, counts; otherwise a sent reminder was followed
  // by a new one every day until the quote expired.
  const sevenDaysFromNow = new Date(now.getTime() + 7 * MS_PER_DAY);
  const expiringQuotes = await prisma.quote.findMany({
    where: { tenantId, status: "SENT", validityDate: { lte: sevenDaysFromNow, gte: now } },
    select: { id: true, quoteNumber: true, validityDate: true },
  });
  const quoteIds = expiringQuotes.map((q) => q.id);
  const remindedQuotes = new Set(
    quoteIds.length
      ? (
          await prisma.reminder.findMany({
            where: { tenantId, documentType: "quote", reminderType: "quote_expiring", documentId: { in: quoteIds } },
            select: { documentId: true },
          })
        ).map((r) => r.documentId)
      : []
  );

  for (const quote of expiringQuotes) {
    if (remindedQuotes.has(quote.id)) continue;
    created.push(
      await prisma.reminder.create({
        data: {
          tenantId,
          reminderType: "quote_expiring",
          documentType: "quote",
          documentId: quote.id,
          scheduledDate: now,
          message: `Quote ${quote.quoteNumber} expires on ${quote.validityDate.toISOString().split("T")[0]}`,
        },
      })
    );
  }

  return created;
}

/**
 * Flip SENT quotes whose validity date has passed to EXPIRED (same transition
 * as the user-triggered /api/alerts/mark-quote-expired route). Pass a tenantId
 * to scope to one tenant, omit it to sweep every tenant (cron). Idempotent:
 * only SENT quotes match, so an already-EXPIRED quote is never touched again.
 */
export async function markExpiredQuotes(tenantId?: string): Promise<number> {
  const result = await prisma.quote.updateMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status: "SENT",
      validityDate: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}
