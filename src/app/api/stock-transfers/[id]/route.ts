import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

/**
 * One transfer with what it moved. A transfer line stores bare ids (no
 * relation on StockTransferLine), so the product and variant names are looked
 * up beside it — the transfer page shows what left one site for the other.
 */
export const GET = withAuth(async (_req, { tenantId, params }) => {
  const transfer = await prisma.stockTransfer.findFirst({
    where: { tenantId, id: params?.id },
    include: {
      fromLocation: { select: { id: true, name: true } },
      toLocation: { select: { id: true, name: true } },
      lines: true,
    },
  });
  if (!transfer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const productIds = Array.from(new Set(transfer.lines.map((l) => l.productId)));
  const variantIds = Array.from(
    new Set(transfer.lines.map((l) => l.variantId).filter((id): id is string => !!id))
  );
  const [products, variants, creator] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, id: { in: productIds } },
      select: { id: true, designation: true, reference: true },
    }),
    variantIds.length
      ? prisma.productVariant.findMany({
          where: { tenantId, id: { in: variantIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    transfer.createdBy
      ? prisma.user.findFirst({
          where: { tenantId, id: transfer.createdBy },
          select: { displayName: true, username: true },
        })
      : Promise.resolve(null),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const variantById = new Map(variants.map((v) => [v.id, v]));

  return NextResponse.json(
    toSnakeCase({
      ...transfer,
      createdByName: creator?.displayName || creator?.username || null,
      lines: transfer.lines.map((l) => ({
        ...l,
        product: productById.get(l.productId) ?? null,
        variant: l.variantId ? variantById.get(l.variantId) ?? null : null,
      })),
    })
  );
});
