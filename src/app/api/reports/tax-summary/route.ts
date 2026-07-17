import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";

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
    salesHt += inv.subtotal;
    salesVat += inv.taxAmount;
    salesTtc += inv.total;
    for (const line of inv.lines) {
      if (line.isSubtotalLine) continue;
      addToRate(salesByRate, line.taxRate, line.subtotal, line.taxAmount, line.total);
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
    purchasesHt += order.subtotal;
    purchasesVat += order.taxAmount;
    purchasesTtc += order.total;
    for (const line of order.lines) {
      addToRate(purchasesByRate, line.taxRate, line.subtotal, line.taxAmount, line.total);
    }
  }

  // ── Net VAT = collected − deductible ─────────────────────────────────────
  const netVat = salesVat - purchasesVat;

  // ── Stamp duty (droit de timbre) on cash payments ────────────────────────
  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const stampDutyEnabled = settings?.stampDutyEnabled ?? false;
  const stampDutyRate = settings?.stampDutyRate ?? 0;

  let cashPaymentsTotal = 0;
  if (stampDutyEnabled) {
    const payments = await prisma.payment.findMany({
      where: { tenantId, paymentDate: range },
    });
    for (const p of payments) {
      if (isCashMethod(p.paymentMethod)) cashPaymentsTotal += p.amount;
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
