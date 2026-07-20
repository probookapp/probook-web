import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";

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

  const [invoices, posTransactions, creditNotes, orders, payments, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId, status: { not: "DRAFT" }, issueDate: range },
      include: { client: true },
      orderBy: [{ issueDate: "asc" }, { invoiceNumber: "asc" }],
    }),
    prisma.posTransaction.findMany({
      where: { tenantId, transactionDate: range, status: { not: "CANCELLED" } },
      include: { client: true },
      orderBy: [{ transactionDate: "asc" }],
    }),
    prisma.creditNote.findMany({
      where: { tenantId, status: "ISSUED", issueDate: range },
      include: { client: true },
      orderBy: [{ issueDate: "asc" }, { creditNoteNumber: "asc" }],
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

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const sales = [
    ...invoices.map((inv) => ({
      date: toDay(inv.issueDate),
      number: inv.invoiceNumber,
      party: inv.client?.name ?? "",
      ht: num(inv.subtotal),
      vat: num(inv.taxAmount),
      ttc: num(inv.total),
    })),
    // POS retail sales (scaled by the transaction-level discount ratio).
    ...posTransactions.map((tx) => {
      const txTotal = num(tx.total);
      const txFinalAmount = num(tx.finalAmount);
      const ratio = txTotal > 0 ? txFinalAmount / txTotal : 1;
      return {
        date: toDay(tx.transactionDate),
        number: tx.ticketNumber,
        party: tx.client?.name ?? "POS",
        ht: round2(num(tx.subtotal) * ratio),
        vat: round2(num(tx.taxAmount) * ratio),
        ttc: round2(txFinalAmount),
      };
    }),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Credit notes / refunds, as negative sales.
  const refunds = creditNotes.map((cn) => ({
    date: toDay(cn.issueDate),
    number: cn.creditNoteNumber,
    party: cn.client?.name ?? "",
    ht: -num(cn.subtotal),
    vat: -num(cn.taxAmount),
    ttc: -num(cn.total),
  }));

  const purchases = orders.map((o) => ({
    date: toDay(o.orderDate),
    number: o.orderNumber,
    party: o.supplier?.name ?? "",
    ht: num(o.subtotal),
    vat: num(o.taxAmount),
    ttc: num(o.total),
  }));

  const paymentRows = payments.map((p) => ({
    date: toDay(p.paymentDate),
    number: p.invoice?.invoiceNumber ?? "",
    amount: num(p.amount),
    method: p.paymentMethod,
  }));

  const expenseRows = expenses.map((e) => ({
    date: toDay(e.date),
    name: e.name,
    amount: num(e.amount),
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
    ...refunds.map((r) => ({
      date: r.date,
      type: "refund",
      document: r.number,
      party: r.party,
      ht: r.ht,
      vat: r.vat,
      ttc: r.ttc,
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
    refunds,
    purchases,
    payments: paymentRows,
    expenses: expenseRows,
    journal,
  };

  return NextResponse.json(toSnakeCase(result));
});
