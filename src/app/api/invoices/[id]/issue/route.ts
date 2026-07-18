import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { applyStockChange } from "@/lib/stock";
import { computeStampDuty } from "@/lib/stamp-duty";
import { computeInvoiceIntegrityHash } from "@/lib/invoice-integrity";

export const POST = withAuth(async (req, { session, tenantId, params }) => {
  const denied = await requirePermission(session, "invoices", "edit");
  if (denied) return denied;

  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } }, client: true },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (invoice.status !== "DRAFT") {
    return NextResponse.json({ error: "Only DRAFT invoices can be issued" }, { status: 400 });
  }

  // Snapshot the droit de timbre at issue time: only for cash-settled invoices
  // at/above the configured threshold, when the feature is enabled. It's a
  // surcharge on the TTC total, not part of revenue/VAT. Otherwise stays 0.
  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const stampDuty = computeStampDuty({
    enabled: settings?.stampDutyEnabled,
    rate: settings?.stampDutyRate,
    threshold: settings?.stampDutyThreshold,
    isCashSale: invoice.isCashSale,
    exempt: invoice.stampDutyExempt,
    total: invoice.total,
    isDraft: false,
  });

  // Keyed (HMAC) integrity hash over the frozen invoice fields, including the
  // stamp duty snapshot being written in the same update (audit SALE-5).
  const integrityHash = computeInvoiceIntegrityHash({
    invoiceNumber: invoice.invoiceNumber,
    clientId: invoice.clientId,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    shippingCost: invoice.shippingCost,
    stampDuty,
    isCashSale: invoice.isCashSale,
    stampDutyExempt: invoice.stampDutyExempt,
    lines: invoice.lines,
  });

  // One tenant-scoped batch lookup instead of a per-line findUnique (SALE-24).
  const productIds = [...new Set(invoice.lines.map((l) => l.productId).filter((id): id is string => !!id))];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { tenantId, id: { in: productIds } },
        select: { id: true, purchasePrice: true, isService: true },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  // Issue the invoice, freeze the COGS snapshots, and decrement stock atomically:
  // an invoice must never end up ISSUED with only some lines' stock deducted.
  const updated = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.update({
      where: { tenantId, id: params?.id },
      data: {
        status: "ISSUED",
        integrityHash,
        stampDuty,
      },
      include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
    });

    // Decrement stock and freeze the cost price snapshot on each product line.
    // The snapshot is what makes COGS / profit reports stable when product purchase prices change later.
    for (const line of inv.lines) {
      if (!line.productId) continue;
      const product = productById.get(line.productId);
      if (!product) continue;

      // Freeze the COGS basis before touching stock.
      await tx.invoiceLine.update({
        where: { id: line.id },
        data: { costPriceSnapshot: product.purchasePrice ?? 0 },
      });

      // Services carry no stock.
      if (product.isService) continue;

      // Route through the stock engine rather than writing product.quantity
      // directly: a direct write skips stock_levels and the ledger, silently
      // drifting the aggregate away from the sum of per-location levels.
      // Invoices aren't location-scoped, so this deducts from the tenant's
      // default location (applyStockChange resolves it when locationId is omitted).
      await applyStockChange(tx, {
        tenantId,
        productId: line.productId,
        type: "sale",
        quantityChange: -Math.round(line.quantity),
        referenceType: "invoice",
        referenceId: inv.id,
        userId: session.userId,
      });
    }

    return inv;
  });

  return NextResponse.json(toSnakeCase(updated));
});
