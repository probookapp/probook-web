import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId }) => {
  const links = await prisma.productSupplier.findMany({
    where: { tenantId },
    include: { product: true, supplier: true },
  });

  // Group by product
  const byProduct: Record<string, {
    product: typeof links[number]["product"];
    suppliers: { supplier: typeof links[number]["supplier"]; purchasePrice: number }[];
    lowestPrice: number;
  }> = {};
  for (const link of links) {
    if (!byProduct[link.productId]) {
      byProduct[link.productId] = {
        product: link.product,
        suppliers: [],
        lowestPrice: Infinity,
      };
    }
    byProduct[link.productId].suppliers.push({
      supplier: link.supplier,
      purchasePrice: link.purchasePrice,
    });
    if (link.purchasePrice < byProduct[link.productId].lowestPrice) {
      byProduct[link.productId].lowestPrice = link.purchasePrice;
    }
  }

  const summaries = Object.values(byProduct).map((entry) => ({
    ...entry,
    lowestPrice: entry.lowestPrice === Infinity ? 0 : entry.lowestPrice,
    supplierCount: entry.suppliers.length,
  }));

  return NextResponse.json(toSnakeCase(summaries));
});
