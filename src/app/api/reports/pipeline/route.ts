import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import {
  QUOTE_STATUSES,
  INVOICE_STATUSES,
  DELIVERY_NOTE_STATUSES,
} from "@/lib/document-status";

/**
 * How many documents are in each state, and what they are worth.
 *
 * The revenue reports answer "what did we bill"; this one answers "what is
 * still moving" — how many quotes are out, how much of it is accepted and not
 * yet invoiced, how much is invoiced and not yet paid. That is the figure a
 * small business steers on, and until now it could only be counted by hand.
 */
/** Delivery notes carry no money of their own, so `total` stays at zero there. */
type Bucket = { status: string; count: number; total: number };

function bucketsFor(
  statuses: readonly string[],
  rows: { status: string; _count: { _all: number }; _sum?: { total: unknown } }[]
): Bucket[] {
  const bySt = new Map(rows.map((r) => [r.status, r]));
  // Every known state is listed, including the empty ones: "0 unpaid" is an
  // answer, a missing row is not.
  return statuses.map((status) => {
    const row = bySt.get(status);
    const total = row?._sum?.total;
    return {
      status,
      count: row?._count._all ?? 0,
      total: total === undefined || total === null ? 0 : num(total as never),
    };
  });
}

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "reports", "view");
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const range: { gte: Date; lt: Date } =
    startDate && endDate
      ? {
          gte: new Date(startDate),
          lt: new Date(new Date(endDate).getTime() + 86400000), // include end date
        }
      : (() => {
          const year = new Date().getFullYear();
          return { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) };
        })();

  const [quoteRows, invoiceRows, deliveryRows, openQuotes, unpaidInvoices, paymentsByInvoice] =
    await Promise.all([
      prisma.quote.groupBy({
        by: ["status"],
        where: { tenantId, issueDate: range },
        _count: { _all: true },
        _sum: { total: true },
      }),
      prisma.invoice.groupBy({
        by: ["status"],
        where: { tenantId, issueDate: range },
        _count: { _all: true },
        _sum: { total: true },
      }),
      // Delivery notes have no totals of their own — counts only.
      prisma.deliveryNote.groupBy({
        by: ["status"],
        where: { tenantId, issueDate: range },
        _count: { _all: true },
      }),
      // Work won but not yet billed: accepted quotes with no invoice behind them.
      prisma.quote.findMany({
        where: { tenantId, issueDate: range, status: "ACCEPTED", invoices: { none: {} } },
        select: { id: true, quoteNumber: true, issueDate: true, total: true, client: { select: { name: true } } },
        orderBy: { issueDate: "asc" },
      }),
      // Billed but not settled. PAID is excluded by status; partial payments are
      // netted off below so the figure is what is actually still owed.
      prisma.invoice.findMany({
        where: { tenantId, issueDate: range, status: "ISSUED" },
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          dueDate: true,
          total: true,
          client: { select: { name: true } },
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.payment.groupBy({
        by: ["invoiceId"],
        where: { tenantId, paymentDate: { lt: range.lt } },
        _sum: { amount: true },
      }),
    ]);

  const paidByInvoice = new Map(
    paymentsByInvoice.map((p) => [p.invoiceId, num(p._sum.amount)])
  );

  const awaitingInvoice = openQuotes.map((q) => ({
    id: q.id,
    number: q.quoteNumber,
    client: q.client?.name ?? "",
    date: q.issueDate.toISOString().split("T")[0],
    amount: num(q.total),
  }));

  const now = Date.now();
  const awaitingPayment = unpaidInvoices
    .map((inv) => {
      const total = num(inv.total);
      const paid = paidByInvoice.get(inv.id) ?? 0;
      const due = inv.dueDate;
      return {
        id: inv.id,
        number: inv.invoiceNumber,
        client: inv.client?.name ?? "",
        date: inv.issueDate.toISOString().split("T")[0],
        dueDate: due ? due.toISOString().split("T")[0] : null,
        amount: total,
        paid,
        remaining: Math.max(0, total - paid),
        overdue: due ? due.getTime() < now : false,
      };
    })
    // A fully-paid invoice that was never marked PAID isn't outstanding.
    .filter((row) => row.remaining > 0);

  const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);

  const result = {
    quotes: bucketsFor(QUOTE_STATUSES, quoteRows),
    invoices: bucketsFor(INVOICE_STATUSES, invoiceRows),
    deliveryNotes: bucketsFor(DELIVERY_NOTE_STATUSES, deliveryRows),
    inProgress: {
      awaitingInvoice,
      awaitingInvoiceTotal: sum(awaitingInvoice),
      awaitingPayment,
      awaitingPaymentTotal: awaitingPayment.reduce((s, r) => s + r.remaining, 0),
      overdueCount: awaitingPayment.filter((r) => r.overdue).length,
      overdueTotal: awaitingPayment
        .filter((r) => r.overdue)
        .reduce((s, r) => s + r.remaining, 0),
    },
  };

  return NextResponse.json(toSnakeCase(result));
});
