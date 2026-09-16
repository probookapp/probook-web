import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { applyStockChange } from "@/lib/stock";
import { computeStampDuty } from "@/lib/stamp-duty";
import { computeInvoiceIntegrityHash } from "@/lib/invoice-integrity";
import { num } from "@/lib/money";

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
    fiscalProfile: settings?.fiscalProfile,
    enabled: settings?.stampDutyEnabled,
    rate: settings?.stampDutyRate,
    threshold: num(settings?.stampDutyThreshold),
    isCashSale: invoice.isCashSale,
    exempt: invoice.stampDutyExempt,
    total: num(invoice.total),
    isDraft: false,
  });

  // Keyed (HMAC) integrity hash over the frozen invoice fields, including the
  // stamp duty snapshot being written in the same update (audit SALE-5).
  const integrityHash = computeInvoiceIntegrityHash({
    invoiceNumber: invoice.invoiceNumber,
    clientId: invoice.clientId,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    subtotal: num(invoice.subtotal),
    taxAmount: num(invoice.taxAmount),
    total: num(invoice.total),
    shippingCost: num(invoice.shippingCost),
    stampDuty,
    isCashSale: invoice.isCashSale,
    stampDutyExempt: invoice.stampDutyExempt,
    // The hash serializes each money field via Number.toString(); map Decimals
    // to numbers here so v2 hashes keep their pre-migration representation.
    lines: invoice.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: num(l.unitPrice),
      taxRate: l.taxRate,
      subtotal: num(l.subtotal),
      total: num(l.total),
    })),
  });

  // One tenant-scoped batch lookup instead of a per-line findUnique (SALE-24).
  const productIds = [...new Set(invoice.lines.map((l) => l.productId).filter((id): id is string => !!id))];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { tenantId, id: { in: productIds } },
        select: {
          id: true,
          purchasePrice: true,
          isService: true,
          hasVariants: true,
          variants: { where: { isActive: true }, select: { id: true }, take: 1 },
        },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  // Stock for a product with variants lives on the variants. A line that never
  // said which one would be taken out of a product-level count that holds
  // nothing, so it is refused here, while the invoice can still be corrected.
  const variantless = invoice.lines.filter((l) => {
    const product = l.productId ? productById.get(l.productId) : undefined;
    return !l.variantId && !!product?.hasVariants && product.variants.length > 0;
  });
  if (variantless.length > 0) {
    return NextResponse.json(
      {
        error:
          "Choose the variant for these lines before issuing: " +
          variantless.map((l) => l.description).join(", "),
        code: "VARIANT_REQUIRED",
      },
      { status: 400 }
    );
  }

  // Issue the invoice, freeze the COGS snapshots, and decrement stock atomically:
  // an invoice must never end up ISSUED with only some lines' stock deducted.
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
    // Atomically claim the DRAFT→ISSUED transition. A concurrent double-click or
    // offline replay that loses this race gets count 0 and must NOT run the
    // stock decrement again (audit CON-1).
    const claimed = await tx.invoice.updateMany({
      where: { tenantId, id: params?.id, status: "DRAFT" },
      data: { status: "ISSUED", integrityHash, stampDuty },
    });
    if (claimed.count !== 1) {
      throw new Error("ALREADY_ISSUED");
    }
    const inv = await tx.invoice.findFirst({
      where: { tenantId, id: params?.id },
      include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
    });
    if (!inv) throw new Error("ALREADY_ISSUED");

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
        // A variant's stock is its own row: without it, a red XL shirt was
        // taken out of the product-level count, which holds nothing.
        variantId: line.variantId ?? null,
        type: "sale",
        // No rounding: the ledger carries the quantity the document says.
        quantityChange: -line.quantity,
        referenceType: "invoice",
        referenceId: inv.id,
        userId: session.userId,
      });
    }

    return inv;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_ISSUED") {
      return NextResponse.json({ error: "Only DRAFT invoices can be issued" }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json(toSnakeCase(updated));
});
