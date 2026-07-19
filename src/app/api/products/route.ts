import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, markOnboardingStep, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { getProductQuantities, recordInitialStock } from "@/lib/stock";
import { validateBody, isValidationError } from "@/lib/validate";
import { productSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId }) => {
  const url = new URL(req.url);
  const fields = url.searchParams.get("include")?.split(",") ?? [];

  // Opt-in cursor pagination (audit SALE-23): lean rows — scalars + category +
  // computed quantity. prices/variants still honor the `include` param, but
  // are only loaded for the page (the POS full-catalog fetch stays on the
  // legacy path below). Quantities are scoped to the page's product ids —
  // no full-catalog groupBy.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.product.findFirst({
          where: { tenantId, id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const rows = await prisma.product.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: {
        category: true,
        prices: fields.includes("prices"),
        variants: fields.includes("variants"),
      },
    });
    const { byProduct, byVariant } = await getProductQuantities(prisma, tenantId, {
      productIds: rows.map((p) => p.id),
    });
    const data = rows.map((p) => {
      const variants = (p as { variants?: { id: string }[] }).variants;
      return {
        ...p,
        quantity: byProduct.get(p.id) ?? 0,
        ...(variants
          ? { variants: variants.map((v) => ({ ...v, quantity: byVariant.get(v.id) ?? 0 })) }
          : {}),
      };
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

  const products = await prisma.product.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      category: true,
      prices: fields.includes("prices"),
      variants: fields.includes("variants"),
    },
  });

  // On-hand is computed from stock_levels (single source of truth) — one
  // groupBy pair for the whole list, then attached so the response shape is
  // unchanged (`quantity` on products and, when included, on variants).
  const { byProduct, byVariant } = await getProductQuantities(prisma, tenantId);
  const withQuantities = products.map((p) => {
    const variants = (p as { variants?: { id: string }[] }).variants;
    return {
      ...p,
      quantity: byProduct.get(p.id) ?? 0,
      ...(variants
        ? { variants: variants.map((v) => ({ ...v, quantity: byVariant.get(v.id) ?? 0 })) }
        : {}),
    };
  });
  return NextResponse.json(toSnakeCase(withQuantities));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "products", "create");
  if (denied) return denied;
  const body = await validateBody(req, productSchema);
  if (isValidationError(body)) return body;
  const prices = body.prices || [];
  // Create the product and seed its initial stock ledger atomically — a failed
  // seed must not leave a product whose aggregate quantity has no ledger row.
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
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

    // Seed an "initial" ledger entry for a stock-tracked product created with a
    // starting quantity — this writes the stock_levels row that IS the stock.
    const initialQuantity = body.quantity ?? 0;
    if (!created.isService && initialQuantity > 0) {
      await recordInitialStock(tx, {
        tenantId,
        productId: created.id,
        quantity: initialQuantity,
        reason: "initial stock",
        referenceType: "manual",
      });
    }

    return created;
  });

  markOnboardingStep(tenantId, "first_product");
  // Echo the initial quantity so the response shape matches the pre-computed
  // era (the created product has no variants yet).
  return NextResponse.json(toSnakeCase({ ...product, quantity: body.quantity ?? 0 }));
});
