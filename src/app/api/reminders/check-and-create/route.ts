import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (req, { tenantId }) => {
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
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
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

  return NextResponse.json(toSnakeCase(created));
});
