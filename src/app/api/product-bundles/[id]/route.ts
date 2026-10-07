import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { getProductQuantities } from "@/lib/stock";
import { validateBody, isValidationError } from "@/lib/validate";
import { productBundleSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import { loadBundleComponents } from "@/lib/bundles-server";

/**
 * A pack's composition.
 *
 * Its own path, apart from /api/products, because composing packs belongs to an
 * offer (FEATURE_KEYS.BUNDLES) and the gate works by path. A product becomes a
 * pack here and nowhere else, so a business without the module cannot make one
 * through the product form either. Selling a pack is never gated: that is
 * invoicing.
 */

const conflict = (error: string, code: string) =>
  NextResponse.json({ error, code }, { status: 409 });

export const GET = withAuth(async (_req, { tenantId, params }) => {
  const id = params?.id as string;
  const pack = await prisma.product.findFirst({
    where: { tenantId, id },
    select: { id: true, isBundle: true },
  });
  if (!pack) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const components = await loadBundleComponents(prisma, tenantId, [id]);
  return NextResponse.json(
    toSnakeCase({ isBundle: pack.isBundle, components: components.get(id) ?? [] })
  );
});

/**
 * Replace the composition, making the product a pack if it was not one. An
 * empty list is accepted: the pack is created first, then filled, and until it
 * is the editors and the till will not sell it.
 */
export const PUT = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "products", "edit");
  if (denied) return denied;
  const id = params?.id as string;
  const body = await validateBody(req, productBundleSchema);
  if (isValidationError(body)) return body;

  const pack = await prisma.product.findFirst({
    where: { tenantId, id },
    select: { id: true, isBundle: true, variants: { select: { id: true } } },
  });
  if (!pack) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!pack.isBundle) {
    // A product that holds stock cannot turn into a pack: the pack has no
    // shelf of its own, and those goods would no longer be counted anywhere.
    const { byProduct, byVariant } = await getProductQuantities(prisma, tenantId, {
      productIds: [id],
    });
    const held =
      (byProduct.get(id) ?? 0) + pack.variants.reduce((s, v) => s + (byVariant.get(v.id) ?? 0), 0);
    if (held !== 0) return conflict("A product with stock cannot become a pack", "BUNDLE_HAS_STOCK");

    const inPack = await prisma.bundleComponent.count({ where: { tenantId, productId: id } });
    if (inPack > 0) return conflict("A product used in a pack cannot become a pack", "BUNDLE_NESTED");
  }

  const components = body.components;
  const packVariantIds = new Set(pack.variants.map((v) => v.id));
  const seen = new Set<string>();
  for (const c of components) {
    if (c.product_id === id) {
      return NextResponse.json({ error: "A pack cannot contain itself", code: "BUNDLE_SELF" }, { status: 400 });
    }
    if (c.bundle_variant_id && !packVariantIds.has(c.bundle_variant_id)) {
      return NextResponse.json({ error: "Unknown pack variant", code: "INVALID_VARIANT" }, { status: 400 });
    }
    const key = `${c.bundle_variant_id ?? ""}|${c.product_id}|${c.variant_id ?? ""}`;
    if (seen.has(key)) {
      return NextResponse.json(
        { error: "The same component is listed twice", code: "BUNDLE_DUPLICATE" },
        { status: 400 }
      );
    }
    seen.add(key);
  }

  const productIds = Array.from(new Set(components.map((c) => c.product_id)));
  const products = await prisma.product.findMany({
    where: { tenantId, id: { in: productIds } },
    select: { id: true, isBundle: true, hasVariants: true, variants: { select: { id: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const c of components) {
    const product = byId.get(c.product_id);
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    if (product.isBundle) {
      return NextResponse.json(
        { error: "A pack cannot contain another pack", code: "BUNDLE_NESTED" },
        { status: 400 }
      );
    }
    // Stock is kept per variant: a component of a product with variants must
    // say which one, or selling the pack would draw on a shelf that holds nothing.
    const ownVariant = c.variant_id ? product.variants.some((v) => v.id === c.variant_id) : false;
    if (c.variant_id ? !ownVariant : product.hasVariants && product.variants.length > 0) {
      return NextResponse.json(
        { error: "A component of a product with variants must name its variant", code: "VARIANT_REQUIRED" },
        { status: 400 }
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.bundleComponent.deleteMany({ where: { tenantId, bundleId: id } });
    if (components.length > 0) {
      await tx.bundleComponent.createMany({
        data: components.map((c, position) => ({
          tenantId,
          bundleId: id,
          bundleVariantId: c.bundle_variant_id || null,
          productId: c.product_id,
          variantId: c.variant_id || null,
          quantity: c.quantity,
          position,
        })),
      });
    }
    // A pack is neither a service nor stocked: what it is made of decides both.
    await tx.product.update({ where: { tenantId, id }, data: { isBundle: true, isService: false } });
  });

  const saved = await loadBundleComponents(prisma, tenantId, [id]);
  return NextResponse.json(toSnakeCase({ isBundle: true, components: saved.get(id) ?? [] }));
});
