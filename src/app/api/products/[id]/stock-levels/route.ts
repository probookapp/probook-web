import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

// Per-location on-hand for a single product. Joins stock_levels + locations and
// groups by location, exposing a variant-level breakdown per location. Only the
// tenant's own product and locations are returned (tenant-scoped via withAuth).
export const GET = withAuth(async (req, { tenantId, params }) => {
  const productId = params?.id as string;

  const product = await prisma.product.findFirst({
    where: { tenantId, id: productId },
    select: { id: true },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const levels = await prisma.stockLevel.findMany({
    where: { tenantId, productId },
    include: { location: true, variant: true },
  });

  const byLocation = new Map<
    string,
    {
      locationId: string;
      locationName: string;
      locationType: string;
      quantity: number;
      variants: { variantId: string; variantName: string | null; quantity: number }[];
    }
  >();

  for (const lvl of levels) {
    if (!lvl.location) continue;
    let entry = byLocation.get(lvl.locationId);
    if (!entry) {
      entry = {
        locationId: lvl.locationId,
        locationName: lvl.location.name,
        locationType: lvl.location.type,
        quantity: 0,
        variants: [],
      };
      byLocation.set(lvl.locationId, entry);
    }
    entry.quantity += lvl.quantity;
    // A null variantId is the base product row; only surface real variants in
    // the per-location breakdown (the location total already includes it).
    if (lvl.variantId) {
      entry.variants.push({
        variantId: lvl.variantId,
        variantName: lvl.variant?.name ?? null,
        quantity: lvl.quantity,
      });
    }
  }

  const rows = Array.from(byLocation.values()).sort((a, b) =>
    a.locationName.localeCompare(b.locationName)
  );

  return NextResponse.json(toSnakeCase(rows));
});
