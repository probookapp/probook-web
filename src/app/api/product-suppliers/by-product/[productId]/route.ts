import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const links = await prisma.productSupplier.findMany({
    where: { tenantId, productId: params?.productId },
    include: { supplier: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(links));
});
