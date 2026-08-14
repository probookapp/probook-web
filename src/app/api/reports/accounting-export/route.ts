import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { resolveDocumentDiscount } from "@/lib/document-totals";

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

  const [settings, invoices, posTransactions, creditNotes, orders, payments, expenses] = await Promise.all([
    prisma.companySettings.findFirst({ where: { tenantId } }),
    prisma.invoice.findMany({
      where: { tenantId, status: { not: "DRAFT" }, issueDate: range },
      // Lines only for their pre-tax value: re-deriving the commercial discount
      // needs the base it was taken from, and the invoice stores only the base
      // after it.
      include: { client: true, lines: { select: { subtotal: true, isSubtotalLine: true } } },
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

  // Every sale-shaped row carries its commercial discount explicitly: `gross_ht`
  // is what the goods were listed at, `discount` what was given away, `ht` the
  // taxable base actually declared. A ledger that showed only the net would make
  // a granted discount indistinguishable from a lower price.
  const sales = [
    ...invoices.map((inv) => {
      const linesSubtotal = inv.lines.reduce(
        (s, l) => (l.isSubtotalLine ? s : s + num(l.subtotal)),
        0
      );
      const { amount: discount } = resolveDocumentDiscount(
        linesSubtotal,
        inv.discountPercent,
        num(inv.discountAmount),
        settings?.currency
      );
      const ht = num(inv.subtotal);
      return {
        date: toDay(inv.issueDate),
        number: inv.invoiceNumber,
        party: inv.client?.name ?? "",
        grossHt: round2(ht + discount),
        discount: round2(discount),
        ht,
        vat: num(inv.taxAmount),
        ttc: num(inv.total),
      };
    }),
    // POS retail sales (scaled by the transaction-level discount ratio).
    ...posTransactions.map((tx) => {
      const txTotal = num(tx.total);
      const txFinalAmount = num(tx.finalAmount);
      const ratio = txTotal > 0 ? txFinalAmount / txTotal : 1;
      const grossHt = num(tx.subtotal);
      return {
        date: toDay(tx.transactionDate),
        number: tx.ticketNumber,
        party: tx.client?.name ?? "POS",
        grossHt: round2(grossHt),
        discount: round2(grossHt * (1 - ratio)),
        ht: round2(grossHt * ratio),
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
    grossHt: -num(cn.subtotal),
    discount: 0,
    ht: -num(cn.subtotal),
    vat: -num(cn.taxAmount),
    ttc: -num(cn.total),
  }));

  const purchases = orders.map((o) => ({
    date: toDay(o.orderDate),
    number: o.orderNumber,
    party: o.supplier?.name ?? "",
    grossHt: num(o.subtotal),
    discount: 0,
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

  // Combined journal (date, type, document, party, gross ht, discount, ht, vat, ttc).
  const journal = [
    ...sales.map((s) => ({
      date: s.date,
      type: "sale",
      document: s.number,
      party: s.party,
      grossHt: s.grossHt,
      discount: s.discount,
      ht: s.ht,
      vat: s.vat,
      ttc: s.ttc,
    })),
    ...refunds.map((r) => ({
      date: r.date,
      type: "refund",
      document: r.number,
      party: r.party,
      grossHt: r.grossHt,
      discount: 0,
      ht: r.ht,
      vat: r.vat,
      ttc: r.ttc,
    })),
    ...purchases.map((p) => ({
      date: p.date,
      type: "purchase",
      document: p.number,
      party: p.party,
      grossHt: p.grossHt,
      discount: 0,
      ht: p.ht,
      vat: p.vat,
      ttc: p.ttc,
    })),
    ...paymentRows.map((p) => ({
      date: p.date,
      type: "payment",
      document: p.number,
      party: p.method,
      grossHt: 0,
      discount: 0,
      ht: 0,
      vat: 0,
      ttc: p.amount,
    })),
    ...expenseRows.map((e) => ({
      date: e.date,
      type: "expense",
      document: "",
      party: e.name,
      grossHt: e.amount,
      discount: 0,
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
