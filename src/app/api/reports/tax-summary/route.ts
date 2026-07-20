import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";

/** A payment method counts toward stamp duty (droit de timbre) when it is cash. */
function isCashMethod(method: string | null | undefined): boolean {
  if (!method) return false;
  const m = method.toLowerCase();
  return m.includes("cash") || m.includes("espece") || m.includes("espèce");
}

/** Accumulate HT / VAT / TTC per tax rate into a mutable map. */
type RateBucket = { taxRate: number; totalHt: number; totalVat: number; totalTtc: number };
function addToRate(
  byRate: Map<number, RateBucket>,
  taxRate: number,
  ht: number,
  vat: number,
  ttc: number
) {
  const existing = byRate.get(taxRate) ?? {
    taxRate,
    totalHt: 0,
    totalVat: 0,
    totalTtc: 0,
  };
  existing.totalHt += ht;
  existing.totalVat += vat;
  existing.totalTtc += ttc;
  byRate.set(taxRate, existing);
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

  // ── Sales VAT (collected) ────────────────────────────────────────────────
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { not: "DRAFT" },
      issueDate: range,
    },
    include: { lines: true },
  });

  let salesHt = 0;
  let salesVat = 0;
  let salesTtc = 0;
  const salesByRate = new Map<number, RateBucket>();

  for (const inv of invoices) {
    salesHt += num(inv.subtotal);
    salesVat += num(inv.taxAmount);
    salesTtc += num(inv.total);
    for (const line of inv.lines) {
      if (line.isSubtotalLine) continue;
      addToRate(salesByRate, num(line.taxRate), num(line.subtotal), num(line.taxAmount), num(line.total));
    }
    // Invoice.subtotal/taxAmount already include shipping, but the line loop
    // above doesn't — add shipping to the per-rate breakdown so it reconciles
    // with the headline totals.
    const shippingCost = num(inv.shippingCost);
    const shippingTaxRate = num(inv.shippingTaxRate);
    if (shippingCost > 0) {
      const shipVat = shippingCost * (shippingTaxRate / 100);
      addToRate(salesByRate, shippingTaxRate, shippingCost, shipVat, shippingCost + shipVat);
    }
  }

  // ── POS retail sales (collected VAT too) ─────────────────────────────────
  // POS sales never become invoices, so a VAT return that ignored them would
  // under-report collected VAT. Scale by the transaction-level discount ratio
  // (finalAmount / total) so a discounted ticket counts what was actually taken.
  const posTransactions = await prisma.posTransaction.findMany({
    where: { tenantId, transactionDate: range, status: { not: "CANCELLED" } },
    include: { lines: true },
  });
  for (const tx of posTransactions) {
    const txTotal = num(tx.total);
    const txFinalAmount = num(tx.finalAmount);
    const ratio = txTotal > 0 ? txFinalAmount / txTotal : 1;
    salesHt += num(tx.subtotal) * ratio;
    salesVat += num(tx.taxAmount) * ratio;
    salesTtc += txFinalAmount;
    for (const line of tx.lines) {
      addToRate(
        salesByRate,
        num(line.taxRate),
        num(line.subtotal) * ratio,
        num(line.taxAmount) * ratio,
        (num(line.subtotal) + num(line.taxAmount)) * ratio
      );
    }
  }

  // ── Credit notes / refunds reduce collected VAT ──────────────────────────
  const creditNotes = await prisma.creditNote.findMany({
    where: { tenantId, status: "ISSUED", issueDate: range },
    include: { lines: true },
  });
  for (const cn of creditNotes) {
    salesHt -= num(cn.subtotal);
    salesVat -= num(cn.taxAmount);
    salesTtc -= num(cn.total);
    for (const line of cn.lines) {
      addToRate(salesByRate, num(line.taxRate), -num(line.subtotal), -num(line.taxAmount), -num(line.total));
    }
  }

  // ── Purchases VAT (deductible) ───────────────────────────────────────────
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      orderDate: range,
      status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED"] },
    },
    include: { lines: true },
  });

  let purchasesHt = 0;
  let purchasesVat = 0;
  let purchasesTtc = 0;
  const purchasesByRate = new Map<number, RateBucket>();

  for (const order of orders) {
    purchasesHt += num(order.subtotal);
    purchasesVat += num(order.taxAmount);
    purchasesTtc += num(order.total);
    for (const line of order.lines) {
      addToRate(purchasesByRate, num(line.taxRate), num(line.subtotal), num(line.taxAmount), num(line.total));
    }
  }

  // ── Net VAT = collected − deductible ─────────────────────────────────────
  const netVat = salesVat - purchasesVat;

  // ── Stamp duty (droit de timbre) on cash payments ────────────────────────
  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const stampDutyEnabled = settings?.stampDutyEnabled ?? false;
  const stampDutyRate = num(settings?.stampDutyRate);

  let cashPaymentsTotal = 0;
  if (stampDutyEnabled) {
    const payments = await prisma.payment.findMany({
      where: { tenantId, paymentDate: range },
    });
    for (const p of payments) {
      if (isCashMethod(p.paymentMethod)) cashPaymentsTotal += num(p.amount);
    }
  }
  const stampDutyAmount = stampDutyEnabled
    ? (cashPaymentsTotal * stampDutyRate) / 100
    : 0;

  const sortByRate = (a: RateBucket, b: RateBucket) => a.taxRate - b.taxRate;

  const result = {
    sales: {
      totalHt: salesHt,
      totalVat: salesVat,
      totalTtc: salesTtc,
      invoiceCount: invoices.length,
      posTransactionCount: posTransactions.length,
      creditNoteCount: creditNotes.length,
      byRate: Array.from(salesByRate.values()).sort(sortByRate),
    },
    purchases: {
      totalHt: purchasesHt,
      totalVat: purchasesVat,
      totalTtc: purchasesTtc,
      orderCount: orders.length,
      byRate: Array.from(purchasesByRate.values()).sort(sortByRate),
    },
    netVat,
    stampDuty: {
      enabled: stampDutyEnabled,
      rate: stampDutyRate,
      cashPaymentsTotal,
      amountDue: stampDutyAmount,
    },
  };

  return NextResponse.json(toSnakeCase(result));
});
