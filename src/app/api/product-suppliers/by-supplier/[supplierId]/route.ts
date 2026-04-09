import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const links = await prisma.productSupplier.findMany({
    where: { tenantId, supplierId: params?.supplierId },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  const products = links.map((link) => ({
    id: link.product.id,
    designation: link.product.designation,
    reference: link.product.reference,
    unit_price: link.product.unitPrice,
    purchase_price: link.purchasePrice,
    link_id: link.id,
  }));

  return NextResponse.json(products);
});
