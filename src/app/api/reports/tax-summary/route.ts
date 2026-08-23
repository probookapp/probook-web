import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { resolveDocumentDiscount } from "@/lib/document-totals";
import { PAYABLE_PURCHASE_STATUSES } from "@/lib/purchase-status";
import { stampDutyApplies } from "@/lib/stamp-duty";

/** A payment method counts toward stamp duty (droit de timbre) when it is cash. */

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

  // Read first: the currency decides the rounding step used when re-deriving a
  // document's discount, and the stamp-duty block below needs the same row.
  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const currency = settings?.currency;

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
  // Commercial discounts granted over the period, pre-tax. Not a tax line of
  // its own, but an accountant reconciling gross sales against the declared
  // base needs to see where the difference went.
  let salesDiscount = 0;
  // What was actually billed as droit de timbre, taken from each invoice's own
  // snapshot. Recomputing it from cash payments — as this did — answered a
  // different question: it ignored the threshold, the legal exemption and the
  // cash-sale flag, and counted every instalment of a part-paid invoice. The
  // figure could not be reconciled against the documents it was meant to
  // summarise, which is the one thing a tax return has to do.
  let stampDutyBilled = 0;
  const salesByRate = new Map<number, RateBucket>();

  for (const inv of invoices) {
    salesHt += num(inv.subtotal);
    salesVat += num(inv.taxAmount);
    salesTtc += num(inv.total);
    stampDutyBilled += num(inv.stampDuty);

    // The document discount is not a line, so scale each line down by the share
    // it kept. Summing raw line subtotals would report a taxable base higher
    // than the invoice's own — the VAT return would over-declare.
    const linesSubtotal = inv.lines.reduce(
      (s, l) => (l.isSubtotalLine ? s : s + num(l.subtotal)),
      0
    );
    const { amount: discount, keptRatio } = resolveDocumentDiscount(
      linesSubtotal,
      inv.discountPercent,
      num(inv.discountAmount),
      currency
    );
    salesDiscount += discount;

    for (const line of inv.lines) {
      if (line.isSubtotalLine) continue;
      addToRate(
        salesByRate,
        num(line.taxRate),
        num(line.subtotal) * keptRatio,
        num(line.taxAmount) * keptRatio,
        num(line.total) * keptRatio
      );
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
    // The till carries its own snapshot, computed on the cash it took. A return
    // that summed only invoices would under-declare every counter sale.
    stampDutyBilled += num(tx.stampDuty);
    const txTotal = num(tx.total);
    const txFinalAmount = num(tx.finalAmount);
    const ratio = txTotal > 0 ? txFinalAmount / txTotal : 1;
    salesHt += num(tx.subtotal) * ratio;
    salesVat += num(tx.taxAmount) * ratio;
    salesTtc += txFinalAmount;
    salesDiscount += num(tx.subtotal) * (1 - ratio);
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
      status: { in: [...PAYABLE_PURCHASE_STATUSES] },
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

  // ── Stamp duty (droit de timbre) ─────────────────────────────────────────
  // Summed from the invoices above, not recomputed. The snapshot is frozen when
  // the invoice is issued, so this reconciles with the documents by construction.
  // The regime as well as the setting: a business that moved to the French
  // regime has no droit de timbre to declare, whatever its old toggle says.
  const stampDutyEnabled = settings ? stampDutyApplies(settings) : false;
  const stampDutyRate = num(settings?.stampDutyRate);

  const sortByRate = (a: RateBucket, b: RateBucket) => a.taxRate - b.taxRate;

  const result = {
    sales: {
      totalHt: salesHt,
      totalVat: salesVat,
      totalTtc: salesTtc,
      // Gross, then what was given away, then the declared base: the three
      // figures an accountant checks against each other.
      grossHt: salesHt + salesDiscount,
      discountHt: salesDiscount,
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
      amountDue: stampDutyBilled,
    },
  };

  return NextResponse.json(toSnakeCase(result));
});
