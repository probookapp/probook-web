import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const barcode = params?.barcode as string;

  // First try product barcode
  const product = await prisma.product.findFirst({
    where: { tenantId, barcode },
    include: { prices: true, variants: true },
  });
  if (product) {
    return NextResponse.json(toSnakeCase(product));
  }

  // Then try variant barcode — return the parent product with a matched_variant field
  const variant = await prisma.productVariant.findFirst({
    where: { tenantId, barcode },
    include: { product: { include: { prices: true, variants: true } } },
  });
  if (variant) {
    const result = {
      ...toSnakeCase(variant.product),
      matched_variant: toSnakeCase(variant),
    };
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Product not found" }, { status: 404 });
});
