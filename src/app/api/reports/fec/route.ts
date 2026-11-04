import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { vatBreakdown } from "@/lib/document-totals";
import { PAYABLE_PURCHASE_STATUSES } from "@/lib/purchase-status";
import { DEFAULT_CURRENCY } from "@/lib/currencies";
import {
  ACCOUNTS,
  auxNum,
  encodeIso885915,
  fecFileName,
  serializeFec,
  settlementAccount,
  settlementJournal,
  type FecEntry,
  type FecLine,
} from "@/lib/fec";

const WALK_IN = { num: "CCOMPTOIR", lib: "Clients comptoir" };

/**
 * The FEC of a period (?year=2026, or ?startDate=&endDate=): every issued
 * invoice and credit note, till sale, purchase, payment and expense written
 * as balanced double-entry lines (src/lib/fec.ts), in ISO 8859-15.
 */
export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "reports", "view");
  if (denied) return denied;
  const params = new URL(req.url).searchParams;
  const year = Number(params.get("year")) || new Date().getUTCFullYear();
  const start = params.get("startDate") ? new Date(params.get("startDate")!) : new Date(Date.UTC(year, 0, 1));
  const end = params.get("endDate") ? new Date(params.get("endDate")!) : new Date(Date.UTC(year, 11, 31));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }
  const range = { gte: start, lt: new Date(end.getTime() + 86400000) };

  const [settings, invoices, creditNotes, posSales, payments, orders, supplierPayments, expenses] = await Promise.all([
    prisma.companySettings.findFirst({ where: { tenantId } }),
    prisma.invoice.findMany({
      where: { tenantId, status: { not: "DRAFT" }, issueDate: range },
      include: { lines: true, client: true },
    }),
    prisma.creditNote.findMany({
      where: { tenantId, status: "ISSUED", issueDate: range },
      include: { lines: true, client: true },
    }),
    prisma.posTransaction.findMany({
      where: { tenantId, transactionDate: range, status: { not: "CANCELLED" } },
      include: { lines: true, payments: true, client: true },
    }),
    prisma.payment.findMany({
      where: { tenantId, paymentDate: range },
      include: { invoice: { include: { client: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { tenantId, orderDate: range, status: { in: [...PAYABLE_PURCHASE_STATUSES] } },
      include: { supplier: true },
    }),
    prisma.supplierPayment.findMany({ where: { tenantId, paymentDate: range }, include: { supplier: true } }),
    prisma.expense.findMany({ where: { tenantId, date: range } }),
  ]);
  const currency = settings?.currency || DEFAULT_CURRENCY;
  const entries: FecEntry[] = [];
  const clientAux = (c: { id: string; name: string } | null | undefined) =>
    c ? { num: auxNum("C", c.id), lib: c.name } : WALK_IN;

  // Sales: invoices.
  for (const inv of invoices) {
    const aux = clientAux(inv.client);
    const sales = inv.operationNature === "SERVICES" ? ACCOUNTS.salesServices : ACCOUNTS.salesGoods;
    const label = `Facture ${inv.invoiceNumber} ${inv.client.name}`;
    const rates = vatBreakdown({
      lines: inv.lines.map((l) => ({
        quantity: l.quantity,
        unit_price: num(l.unitPrice),
        tax_rate: l.taxRate,
        discount_percent: l.discountPercent,
        is_subtotal_line: l.isSubtotalLine,
        is_bundle_header: l.isBundleHeader,
      })),
      discountPercent: inv.discountPercent,
      discountAmount: num(inv.discountAmount),
      currency,
    });
    const shipping = num(inv.shippingCost);
    const ratesTax = rates.reduce((s, r) => s + r.tax, 0);
    const lines: FecLine[] = [{ account: ACCOUNTS.clients, aux, label, debit: num(inv.total), credit: 0 }];
    for (const r of rates) lines.push({ account: sales, label: `${label} HT ${r.rate}%`, debit: 0, credit: r.base });
    if (shipping > 0) lines.push({ account: ACCOUNTS.shipping, label: `${label} port`, debit: 0, credit: shipping });
    for (const r of rates) {
      if (r.tax) lines.push({ account: ACCOUNTS.vatCollected, label: `${label} TVA ${r.rate}%`, debit: 0, credit: r.tax });
    }
    const shippingTax = num(inv.taxAmount) - ratesTax;
    if (shippingTax > 0.004) {
      lines.push({ account: ACCOUNTS.vatCollected, label: `${label} TVA port`, debit: 0, credit: shippingTax });
    }
    entries.push({ journal: "VE", date: inv.issueDate, pieceRef: inv.invoiceNumber, pieceDate: inv.issueDate, lines });
  }

  // Sales: credit notes, the reverse.
  for (const cn of creditNotes) {
    const aux = clientAux(cn.client);
    const label = `Avoir ${cn.creditNoteNumber} ${cn.client.name}`;
    const byRate = new Map<number, { ht: number; vat: number }>();
    for (const l of cn.lines) {
      const row = byRate.get(l.taxRate) ?? { ht: 0, vat: 0 };
      row.ht += num(l.subtotal);
      row.vat += num(l.taxAmount);
      byRate.set(l.taxRate, row);
    }
    const lines: FecLine[] = [];
    for (const [rate, r] of byRate) lines.push({ account: ACCOUNTS.salesGoods, label: `${label} HT ${rate}%`, debit: r.ht, credit: 0 });
    for (const [rate, r] of byRate) {
      if (r.vat) lines.push({ account: ACCOUNTS.vatCollected, label: `${label} TVA ${rate}%`, debit: r.vat, credit: 0 });
    }
    lines.push({ account: ACCOUNTS.clients, aux, label, debit: 0, credit: num(cn.total) });
    entries.push({ journal: "VE", date: cn.issueDate, pieceRef: cn.creditNoteNumber, pieceDate: cn.issueDate, lines });
  }

  // Till sales.
  for (const tx of posSales) {
    const aux = clientAux(tx.client);
    const label = `Ticket ${tx.ticketNumber}`;
    const finalAmount = num(tx.finalAmount);
    const paid = tx.payments.map((p) => ({ method: p.paymentMethod, amount: num(p.amount) - num(p.changeGiven) }));
    const paidTotal = paid.reduce((s, p) => s + p.amount, 0);
    // Payments may include a stamp duty on top of the sale: book the sale's
    // amount, split across the methods in proportion.
    const scale = paidTotal > 0 ? finalAmount / paidTotal : 0;
    const debits: FecLine[] = paid.length
      ? paid.map((p) => {
          const onAccount = p.method.toUpperCase() === "CREDIT";
          return {
            account: onAccount ? ACCOUNTS.clients : settlementAccount(p.method),
            aux: onAccount ? aux : null,
            label: `${label} ${p.method.toLowerCase()}`,
            debit: p.amount * scale,
            credit: 0,
          };
        })
      : [{ account: ACCOUNTS.cash, label, debit: finalAmount, credit: 0 }];
    if (tx.invoiceId) {
      // The sale is booked with its invoice; the till only settles it.
      entries.push({
        journal: "CA",
        date: tx.transactionDate,
        pieceRef: tx.ticketNumber,
        pieceDate: tx.transactionDate,
        lines: [...debits, { account: ACCOUNTS.clients, aux, label, debit: 0, credit: finalAmount }],
      });
      continue;
    }
    const ratio = num(tx.total) > 0 ? finalAmount / num(tx.total) : 1;
    const byRate = new Map<number, { ht: number; vat: number }>();
    for (const l of tx.lines) {
      if (l.isBundleHeader) continue;
      const row = byRate.get(l.taxRate) ?? { ht: 0, vat: 0 };
      row.ht += num(l.subtotal) * ratio;
      row.vat += num(l.taxAmount) * ratio;
      byRate.set(l.taxRate, row);
    }
    const credits: FecLine[] = [];
    for (const [rate, r] of byRate) credits.push({ account: ACCOUNTS.salesGoods, label: `${label} HT ${rate}%`, debit: 0, credit: r.ht });
    for (const [rate, r] of byRate) {
      if (r.vat) credits.push({ account: ACCOUNTS.vatCollected, label: `${label} TVA ${rate}%`, debit: 0, credit: r.vat });
    }
    entries.push({
      journal: "CA",
      date: tx.transactionDate,
      pieceRef: tx.ticketNumber,
      pieceDate: tx.transactionDate,
      lines: [...debits, ...credits],
    });
  }

  // Invoice payments.
  for (const p of payments) {
    const aux = clientAux(p.invoice.client);
    const label = `Règlement ${p.invoice.invoiceNumber} ${p.invoice.client.name}`;
    entries.push({
      journal: settlementJournal(p.paymentMethod),
      date: p.paymentDate,
      pieceRef: p.reference || p.invoice.invoiceNumber,
      pieceDate: p.paymentDate,
      lines: [
        { account: settlementAccount(p.paymentMethod), label, debit: num(p.amount), credit: 0 },
        { account: ACCOUNTS.clients, aux, label, debit: 0, credit: num(p.amount) },
      ],
    });
  }

  // Purchases and supplier payments.
  for (const o of orders) {
    const aux = { num: auxNum("F", o.supplier.id), lib: o.supplier.name };
    const label = `Achat ${o.orderNumber} ${o.supplier.name}`;
    entries.push({
      journal: "HA",
      date: o.orderDate,
      pieceRef: o.orderNumber,
      pieceDate: o.orderDate,
      lines: [
        { account: ACCOUNTS.purchases, label, debit: num(o.subtotal), credit: 0 },
        { account: ACCOUNTS.vatDeductible, label, debit: num(o.taxAmount), credit: 0 },
        { account: ACCOUNTS.suppliers, aux, label, debit: 0, credit: num(o.total) },
      ],
    });
  }
  for (const p of supplierPayments) {
    const aux = { num: auxNum("F", p.supplier.id), lib: p.supplier.name };
    const label = `Paiement ${p.supplier.name}`;
    entries.push({
      journal: settlementJournal(p.paymentMethod),
      date: p.paymentDate,
      pieceRef: p.reference || `PF-${p.id.slice(0, 8)}`,
      pieceDate: p.paymentDate,
      lines: [
        { account: ACCOUNTS.suppliers, aux, label, debit: num(p.amount), credit: 0 },
        { account: settlementAccount(p.paymentMethod), label, debit: 0, credit: num(p.amount) },
      ],
    });
  }

  // Expenses: amounts without VAT detail, paid from the bank.
  for (const e of expenses) {
    entries.push({
      journal: "BQ",
      date: e.date,
      pieceRef: `DEP-${e.id.slice(0, 8)}`,
      pieceDate: e.date,
      lines: [
        { account: ACCOUNTS.expenses, label: e.name, debit: num(e.amount), credit: 0 },
        { account: ACCOUNTS.bank, label: e.name, debit: 0, credit: num(e.amount) },
      ],
    });
  }

  const body = encodeIso885915(serializeFec(entries, currency));
  return new NextResponse(body as BodyInit, {
    headers: {
      "Content-Type": "text/plain; charset=iso-8859-15",
      "Content-Disposition": `attachment; filename="${fecFileName(settings?.siret, end)}"`,
    },
  });
});
