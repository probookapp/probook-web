import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";

/**
 * Accountant-friendly dataset for a period: sales, purchases, payments and
 * expenses, plus a combined journal-style list. Deterministically ordered by
 * date then document so exports are reproducible.
 */
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

  const [invoices, orders, payments, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId, status: { not: "DRAFT" }, issueDate: range },
      include: { client: true },
      orderBy: [{ issueDate: "asc" }, { invoiceNumber: "asc" }],
    }),
    prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        orderDate: range,
        status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED"] },
      },
      include: { supplier: true },
      orderBy: [{ orderDate: "asc" }, { orderNumber: "asc" }],
    }),
    prisma.payment.findMany({
      where: { tenantId, paymentDate: range },
      include: { invoice: true },
      orderBy: [{ paymentDate: "asc" }],
    }),
    prisma.expense.findMany({
      where: { tenantId, date: range },
      orderBy: [{ date: "asc" }],
    }),
  ]);

  const toDay = (d: Date) => d.toISOString().split("T")[0];

  const sales = invoices.map((inv) => ({
    date: toDay(inv.issueDate),
    number: inv.invoiceNumber,
    party: inv.client?.name ?? "",
    ht: inv.subtotal,
    vat: inv.taxAmount,
    ttc: inv.total,
  }));

  const purchases = orders.map((o) => ({
    date: toDay(o.orderDate),
    number: o.orderNumber,
    party: o.supplier?.name ?? "",
    ht: o.subtotal,
    vat: o.taxAmount,
    ttc: o.total,
  }));

  const paymentRows = payments.map((p) => ({
    date: toDay(p.paymentDate),
    number: p.invoice?.invoiceNumber ?? "",
    amount: p.amount,
    method: p.paymentMethod,
  }));

  const expenseRows = expenses.map((e) => ({
    date: toDay(e.date),
    name: e.name,
    amount: e.amount,
  }));

  // Combined journal (columns: date, type, document, party, ht, vat, ttc).
  const journal = [
    ...sales.map((s) => ({
      date: s.date,
      type: "sale",
      document: s.number,
      party: s.party,
      ht: s.ht,
      vat: s.vat,
      ttc: s.ttc,
    })),
    ...purchases.map((p) => ({
      date: p.date,
      type: "purchase",
      document: p.number,
      party: p.party,
      ht: p.ht,
      vat: p.vat,
      ttc: p.ttc,
    })),
    ...paymentRows.map((p) => ({
      date: p.date,
      type: "payment",
      document: p.number,
      party: p.method,
      ht: 0,
      vat: 0,
      ttc: p.amount,
    })),
    ...expenseRows.map((e) => ({
      date: e.date,
      type: "expense",
      document: "",
      party: e.name,
      ht: e.amount,
      vat: 0,
      ttc: e.amount,
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const result = {
    sales,
    purchases,
    payments: paymentRows,
    expenses: expenseRows,
    journal,
  };

  return NextResponse.json(toSnakeCase(result));
});
