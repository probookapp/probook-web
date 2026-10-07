import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { withBundleDetails } from "@/lib/bundles-server";

type Found = NonNullable<Awaited<ReturnType<typeof findByBarcode>>>;

function findByBarcode(tenantId: string, barcode: string) {
  return prisma.product.findFirst({
    where: { tenantId, barcode },
    include: { prices: true, variants: true },
  });
}

/** A pack scanned at the till must arrive with what it is made of. */
async function withPackDetails(tenantId: string, product: Found) {
  if (!product.isBundle) return product;
  const [pack] = await withBundleDetails(prisma, tenantId, [
    { ...product, quantity: null, variants: product.variants.map((v) => ({ ...v, quantity: null })) },
  ]);
  return pack;
}

export const GET = withAuth(async (req, { tenantId, params }) => {
  const barcode = params?.barcode as string;

  // First try product barcode
  const product = await findByBarcode(tenantId, barcode);
  if (product) {
    return NextResponse.json(toSnakeCase(await withPackDetails(tenantId, product)));
  }

  // Then try variant barcode — return the parent product with a matched_variant field
  const variant = await prisma.productVariant.findFirst({
    where: { tenantId, barcode },
    include: { product: { include: { prices: true, variants: true } } },
  });
  if (variant) {
    const result = {
      ...toSnakeCase(await withPackDetails(tenantId, variant.product)),
      matched_variant: toSnakeCase(variant),
    };
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Product not found" }, { status: 404 });
});
