import { prisma } from "./db";

/**
 * Server-side reminder sweep, shared by the dashboard-triggered
 * /api/reminders/check-and-create route (single tenant, user session) and the
 * /api/cron/reminders job (all tenants, no session).
 *
 * Idempotent: a document only gets a new reminder when it has no pending
 * (sentAt: null) reminder of the same type, so running the sweep twice never
 * duplicates. Sending is deliberately NOT done here — reminder emails go out
 * through the user-triggered /api/reminders/[id]/send flow, which needs the
 * user's permissions and supports the mailto fallback when Resend is not
 * configured.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Create due reminders for one tenant. Returns the newly created reminders. */
export async function sweepTenantReminders(tenantId: string) {
  const now = new Date();
  const created: Awaited<ReturnType<typeof prisma.reminder.create>>[] = [];

  // Check for overdue invoices without pending reminders
  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: "ISSUED",
      dueDate: { lt: now },
    },
  });

  for (const invoice of overdueInvoices) {
    const existing = await prisma.reminder.findFirst({
      where: {
        tenantId,
        documentType: "invoice",
        documentId: invoice.id,
        reminderType: "payment_overdue",
        sentAt: null,
      },
    });

    if (!existing) {
      const reminder = await prisma.reminder.create({
        data: {
          tenantId,
          reminderType: "payment_overdue",
          documentType: "invoice",
          documentId: invoice.id,
          scheduledDate: now,
          message: `Payment overdue for invoice ${invoice.invoiceNumber}`,
        },
      });
      created.push(reminder);
    }
  }

  // Check for quotes nearing expiry (within 7 days)
  const sevenDaysFromNow = new Date(now.getTime() + 7 * MS_PER_DAY);
  const expiringQuotes = await prisma.quote.findMany({
    where: {
      tenantId,
      status: "SENT",
      validityDate: { lte: sevenDaysFromNow, gte: now },
    },
  });

  for (const quote of expiringQuotes) {
    const existing = await prisma.reminder.findFirst({
      where: {
        tenantId,
        documentType: "quote",
        documentId: quote.id,
        reminderType: "quote_expiring",
        sentAt: null,
      },
    });

    if (!existing) {
      const reminder = await prisma.reminder.create({
        data: {
          tenantId,
          reminderType: "quote_expiring",
          documentType: "quote",
          documentId: quote.id,
          scheduledDate: now,
          message: `Quote ${quote.quoteNumber} expires on ${quote.validityDate.toISOString().split("T")[0]}`,
        },
      });
      created.push(reminder);
    }
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
