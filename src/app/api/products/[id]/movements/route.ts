import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

// Stock-movements ledger for a single product (newest first, with variant name).
export const GET = withAuth(async (req, { tenantId, params }) => {
  const productId = params?.id as string;

  const product = await prisma.product.findFirst({
    where: { tenantId, id: productId },
    select: { id: true },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const movements = await prisma.stockMovement.findMany({
    where: { tenantId, productId },
    orderBy: { createdAt: "desc" },
    include: { variant: { select: { name: true } } },
  });

  const result = movements.map((m) => ({
    id: m.id,
    productId: m.productId,
    variantId: m.variantId,
    variantName: m.variant?.name ?? null,
    type: m.type,
    quantityChange: m.quantityChange,
    balanceAfter: m.balanceAfter,
    reason: m.reason,
    referenceType: m.referenceType,
    referenceId: m.referenceId,
    userId: m.userId,
    createdAt: m.createdAt,
  }));

  return NextResponse.json(toSnakeCase(result));
});
