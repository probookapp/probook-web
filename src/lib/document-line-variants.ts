import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface LineRef {
  product_id?: string | null;
  variant_id?: string | null;
}

/**
 * Refuse a document line naming a variant this business does not own, or a
 * variant of some other product than the line's.
 *
 * The variant decides which stock row an issued invoice draws on, so a crafted
 * or stale id must not reach it: another tenant's variant would be decremented,
 * and a mismatched pair would take the goods out of the wrong product. Same rule
 * the till applies (src/app/api/pos/transactions/route.ts).
 *
 * A line for a product with variants but none chosen is still accepted: older
 * documents and API clients send none, and issuing such a line keeps the
 * product-level behaviour it always had.
 */
export async function rejectInvalidLineVariants(
  tenantId: string,
  lines: ReadonlyArray<LineRef>
): Promise<NextResponse | null> {
  const withVariant = lines.filter((l) => l.variant_id);
  if (withVariant.length === 0) return null;

  const ids = Array.from(new Set(withVariant.map((l) => l.variant_id as string)));
  const variants = await prisma.productVariant.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, productId: true },
  });
  const productOf = new Map(variants.map((v) => [v.id, v.productId]));

  const invalid = withVariant.some(
    (l) => productOf.get(l.variant_id as string) !== l.product_id
  );
  if (variants.length !== ids.length || invalid) {
    return NextResponse.json(
      { error: "One or more variants do not exist for their product", code: "INVALID_VARIANT" },
      { status: 400 }
    );
  }
  return null;
}
