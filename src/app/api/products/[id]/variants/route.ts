import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { recordInitialStock } from "@/lib/stock";
import { validateBody, isValidationError } from "@/lib/validate";
import { productVariantSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const productId = params?.id as string;

  // Verify product belongs to tenant
  const product = await prisma.product.findFirst({
    where: { tenantId, id: productId },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const variants = await prisma.productVariant.findMany({
    where: { tenantId, productId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(toSnakeCase(variants));
});

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "products", "create");
  if (denied) return denied;
  const productId = params?.id as string;
  const body = await validateBody(req, productVariantSchema);
  if (isValidationError(body)) return body;

  // Verify product belongs to tenant
  const product = await prisma.product.findFirst({
    where: { tenantId, id: productId },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  // Ensure barcode uniqueness within tenant (if provided)
  if (body.barcode) {
    const existing = await prisma.productVariant.findFirst({
      where: { tenantId, barcode: body.barcode },
    });
    if (existing) {
      return NextResponse.json({ error: "Barcode already in use by another variant" }, { status: 400 });
    }
    // Also check product barcodes
    const existingProduct = await prisma.product.findFirst({
      where: { tenantId, barcode: body.barcode },
    });
    if (existingProduct) {
      return NextResponse.json({ error: "Barcode already in use by a product" }, { status: 400 });
    }
  }

  // Create the variant, seed its initial stock and flag the parent atomically:
  // the variant's aggregate quantity, its stock level and the ledger row must
  // never diverge (stock.ts accounting keeps variant stock on the variant only;
  // the parent product's aggregate is not part of variant stock).
  const variant = await prisma.$transaction(async (tx) => {
    const created = await tx.productVariant.create({
      data: {
        tenantId,
        productId,
        name: body.name,
        sku: body.sku || null,
        barcode: body.barcode || null,
        attributes: (body.attributes || {}) as Record<string, string>,
        quantity: body.quantity ?? 0,
        priceOverride: body.price_override ?? null,
        isActive: body.is_active ?? true,
      },
    });

    // Seed an "initial" ledger entry when the variant starts with stock on hand.
    if ((created.quantity ?? 0) > 0) {
      await recordInitialStock(tx, {
        tenantId,
        productId,
        variantId: created.id,
        quantity: created.quantity ?? 0,
        reason: "initial stock",
        referenceType: "manual",
        userId: session.userId,
      });
    }

    // Ensure product is marked as having variants
    if (!product.hasVariants) {
      await tx.product.update({
        where: { tenantId, id: productId },
        data: { hasVariants: true },
      });
    }

    return created;
  });

  return NextResponse.json(toSnakeCase(variant));
});
