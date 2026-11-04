import { prisma } from "@/lib/db";
import { deriveOperationNature, OPERATION_NATURES, type OperationNature } from "@/lib/legal-mentions";

/**
 * The nature an invoice declares (goods, services, mixed): what the user chose,
 * or else what its lines' products say. A free-text line has no product to
 * ask, so its presence leaves the field empty and the invoice page asks.
 */
export async function resolveOperationNature(
  tenantId: string,
  explicit: string | null | undefined,
  lines: Array<{ product_id?: string | null; is_subtotal_line?: boolean | null; is_bundle_header?: boolean | null }>
): Promise<OperationNature | null> {
  if (explicit && (OPERATION_NATURES as readonly string[]).includes(explicit)) {
    return explicit as OperationNature;
  }
  // A pack header carries no goods of its own; its components say what it is.
  const billed = lines.filter((l) => !l.is_subtotal_line && !l.is_bundle_header);
  const ids = [...new Set(billed.map((l) => l.product_id).filter((id): id is string => !!id))];
  const products = ids.length
    ? await prisma.product.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, isService: true } })
    : [];
  const byId = new Map(products.map((p) => [p.id, p.isService]));
  return deriveOperationNature(billed.map((l) => (l.product_id ? (byId.get(l.product_id) ?? null) : null)));
}
