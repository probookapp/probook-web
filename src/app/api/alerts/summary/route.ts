import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId }) => {
  const now = new Date();

  // Overdue invoices (past due date)
  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: "ISSUED",
      dueDate: { lt: now },
    },
    include: { client: true },
  });

  // Due soon invoices (due within 7 days, not yet overdue)
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dueSoonInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: "ISSUED",
      dueDate: { gte: now, lte: sevenDaysFromNow },
    },
    include: { client: true },
  });

  // Expiring quotes (within 7 days)
  const expiringQuotes = await prisma.quote.findMany({
    where: {
      tenantId,
      status: "SENT",
      validityDate: { lte: sevenDaysFromNow, gte: now },
    },
    include: { client: true },
  });

  // Already expired quotes still in SENT status
  const expiredQuotes = await prisma.quote.findMany({
    where: {
      tenantId,
      status: "SENT",
      validityDate: { lt: now },
    },
    include: { client: true },
  });

  const msPerDay = 24 * 60 * 60 * 1000;

  const overdueAlerts = overdueInvoices.map((inv) => ({
    id: `overdue-${inv.id}`,
    alertType: "OVERDUE_INVOICE" as const,
    title: inv.invoiceNumber,
    message: "",
    documentType: "invoice" as const,
    documentId: inv.id,
    documentNumber: inv.invoiceNumber,
    clientName: inv.client.name,
    amount: inv.total,
    date: inv.dueDate.toISOString(),
    days: Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / msPerDay),
    severity: "danger" as const,
  }));

  const dueSoonAlerts = dueSoonInvoices.map((inv) => ({
    id: `duesoon-${inv.id}`,
    alertType: "DUE_SOON" as const,
    title: inv.invoiceNumber,
    message: "",
    documentType: "invoice" as const,
    documentId: inv.id,
    documentNumber: inv.invoiceNumber,
    clientName: inv.client.name,
    amount: inv.total,
    date: inv.dueDate.toISOString(),
    days: -Math.floor((new Date(inv.dueDate).getTime() - now.getTime()) / msPerDay),
    severity: "warning" as const,
  }));

  const expiringAlerts = expiringQuotes.map((q) => ({
    id: `expiring-${q.id}`,
    alertType: "EXPIRING_QUOTE" as const,
    title: q.quoteNumber,
    message: "",
    documentType: "quote" as const,
    documentId: q.id,
    documentNumber: q.quoteNumber,
    clientName: q.client.name,
    amount: q.total,
    date: q.validityDate.toISOString(),
    days: -Math.floor((new Date(q.validityDate).getTime() - now.getTime()) / msPerDay),
    severity: "warning" as const,
  }));

  const expiredAlerts = expiredQuotes.map((q) => ({
    id: `expired-${q.id}`,
    alertType: "EXPIRED_QUOTE" as const,
    title: q.quoteNumber,
    message: "",
    documentType: "quote" as const,
    documentId: q.id,
    documentNumber: q.quoteNumber,
    clientName: q.client.name,
    amount: q.total,
    date: q.validityDate.toISOString(),
    days: Math.floor((now.getTime() - new Date(q.validityDate).getTime()) / msPerDay),
    severity: "danger" as const,
  }));

  const totalOverdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.total, 0);
  const totalCount = overdueAlerts.length + dueSoonAlerts.length + expiringAlerts.length + expiredAlerts.length;

  return NextResponse.json(toSnakeCase({
    overdueInvoices: overdueAlerts,
    dueSoonInvoices: dueSoonAlerts,
    expiringQuotes: expiringAlerts,
    expiredQuotes: expiredAlerts,
    totalOverdueAmount: totalOverdueAmount,
    totalCount,
  }));
});
