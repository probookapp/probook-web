import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { buildCashJournal, type CashMovement } from "@/lib/cash-journal";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Money in and out, by where it sits (cash, cheques, bank), over a period,
 * with the balances it opens and closes on. See src/lib/cash-journal.ts.
 */
export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "reports", "view");
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const today = ymd(new Date());
  const to = searchParams.get("endDate") || today;
  const from = searchParams.get("startDate") || `${to.slice(0, 4)}-01-01`;

  const settings = await prisma.companySettings.findFirst({
    where: { tenantId },
    select: { cashJournalStart: true, openingCash: true, openingCheques: true, openingBank: true },
  });
  const start = settings?.cashJournalStart ? ymd(settings.cashJournalStart) : null;

  // Everything from the declared start (or from the beginning, when none is
  // declared) up to the end of the period: what came before the period makes
  // the balance it opens on.
  const range = {
    ...(start ? { gte: new Date(start) } : {}),
    lt: new Date(new Date(to).getTime() + 86400000),
  };

  const [payments, posPayments, supplierPayments, expenses] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId, paymentDate: range },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        invoiceId: true,
        quoteId: true,
        invoice: { select: { invoiceNumber: true, client: { select: { name: true } } } },
        quote: { select: { quoteNumber: true, client: { select: { name: true } } } },
      },
    }),
    prisma.posPayment.findMany({
      where: {
        transaction: { tenantId, status: { not: "CANCELLED" }, transactionDate: range },
      },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        transaction: { select: { ticketNumber: true, transactionDate: true, client: { select: { name: true } } } },
      },
    }),
    prisma.supplierPayment.findMany({
      where: { tenantId, paymentDate: range },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        paymentMethod: true,
        supplierId: true,
        purchaseOrderId: true,
        supplier: { select: { name: true } },
        purchaseOrder: { select: { orderNumber: true } },
      },
    }),
    prisma.expense.findMany({
      where: { tenantId, date: range },
      select: {
        id: true,
        name: true,
        amount: true,
        date: true,
        paymentMethod: true,
        createdBy: { select: { displayName: true } },
      },
    }),
  ]);

  const movements: CashMovement[] = [
    ...payments.map((p) => {
      // Still on its quote: a deposit; otherwise the invoice it settles (a
      // deposit carried onto an invoice reads as that invoice's payment).
      const onInvoice = p.invoiceId && p.invoice;
      return {
        id: p.id,
        date: ymd(p.paymentDate),
        kind: onInvoice ? ("invoice_payment" as const) : ("quote_deposit" as const),
        amount: num(p.amount),
        method: p.paymentMethod,
        reference: onInvoice ? p.invoice!.invoiceNumber : p.quote?.quoteNumber ?? "",
        party: onInvoice ? p.invoice!.client.name : p.quote?.client.name ?? null,
        link: onInvoice ? `/invoices/${p.invoiceId}` : p.quoteId ? `/quotes/${p.quoteId}` : null,
      };
    }),
    ...posPayments.map((p) => ({
      id: p.id,
      date: ymd(p.transaction.transactionDate),
      kind: "pos_sale" as const,
      amount: num(p.amount),
      method: p.paymentMethod,
      reference: p.transaction.ticketNumber,
      party: p.transaction.client?.name ?? null,
      link: null,
    })),
    ...supplierPayments.map((p) => ({
      id: p.id,
      date: ymd(p.paymentDate),
      kind: "supplier_payment" as const,
      amount: -num(p.amount),
      method: p.paymentMethod,
      reference: p.purchaseOrder?.orderNumber ?? "",
      party: p.supplier.name,
      link: p.purchaseOrderId ? `/purchases/${p.purchaseOrderId}` : "/suppliers",
    })),
    ...expenses.map((e) => ({
      id: e.id,
      date: ymd(e.date),
      kind: "expense" as const,
      amount: -num(e.amount),
      method: e.paymentMethod,
      reference: e.name,
      party: e.createdBy?.displayName ?? null,
      link: "/expenses",
    })),
  ];

  const journal = buildCashJournal(
    {
      start,
      cash: num(settings?.openingCash),
      cheque: num(settings?.openingCheques),
      bank: num(settings?.openingBank),
    },
    { from, to },
    movements
  );

  return NextResponse.json(toSnakeCase(journal));
});
