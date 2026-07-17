import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, markOnboardingStep } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { recordInitialStock } from "@/lib/stock";
import { validateBody, isValidationError } from "@/lib/validate";
import { productSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId }) => {
  const url = new URL(req.url);
  const fields = url.searchParams.get("include")?.split(",") ?? [];

  const products = await prisma.product.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      category: true,
      prices: fields.includes("prices"),
      variants: fields.includes("variants"),
    },
  });
  return NextResponse.json(toSnakeCase(products));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "products", "create");
  if (denied) return denied;
  const body = await validateBody(req, productSchema);
  if (isValidationError(body)) return body;
  const prices = body.prices || [];
  const product = await prisma.product.create({
    data: {
      tenantId,
      designation: body.designation,
      description: body.description || null,
      descriptionHtml: body.description_html || null,
      unitPrice: body.unit_price,
      taxRate: body.tax_rate ?? 20.0,
      unit: body.unit || "unit",
      reference: body.reference || null,
      barcode: body.barcode || null,
      isService: body.is_service || false,
      categoryId: body.category_id || null,
      quantity: body.quantity ?? 0,
      purchasePrice: body.purchase_price ?? 0,
      hasVariants: body.has_variants || false,
      prices: prices.length > 0 ? {
        create: prices.map((p: { label: string; price: number }) => ({
          tenantId,
          label: p.label,
          price: p.price,
        })),
      } : undefined,
    },
    include: { prices: true, variants: true },
  });

  // Seed an "initial" ledger entry for a stock-tracked product created with a starting quantity.
  if (!product.isService && (product.quantity ?? 0) > 0) {
    await recordInitialStock(prisma, {
      tenantId,
      productId: product.id,
      quantity: product.quantity ?? 0,
      reason: "initial stock",
      referenceType: "manual",
    });
  }

  markOnboardingStep(tenantId, "first_product");
  return NextResponse.json(toSnakeCase(product));
});
