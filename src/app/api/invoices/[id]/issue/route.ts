import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { applyStockChange } from "@/lib/stock";
import { computeStampDuty } from "@/lib/stamp-duty";
import { createHash } from "crypto";

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
    total: invoice.total,
    isDraft: false,
  });

  // Compute integrity hash from key fields
  const hashInput = [
    invoice.invoiceNumber,
    invoice.clientId,
    invoice.issueDate.toISOString(),
    invoice.subtotal.toString(),
    invoice.taxAmount.toString(),
    invoice.total.toString(),
    ...invoice.lines.map((l) =>
      `${l.description}|${l.quantity}|${l.unitPrice}|${l.taxRate}|${l.subtotal}`
    ),
  ].join("|");

  const integrityHash = createHash("sha256").update(hashInput).digest("hex");

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
      const product = await tx.product.findUnique({ where: { id: line.productId } });
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
