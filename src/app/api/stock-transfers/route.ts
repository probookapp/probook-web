import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { applyStockChange } from "@/lib/stock";
import { requirePermission } from "@/lib/permissions-server";
import { requireFeature } from "@/lib/feature-gate";

function generateTransferNumber(): string {
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `TR-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

export const GET = withAuth(async (req, { tenantId }) => {
  // Opt-in cursor pagination (audit SALE-23): lean rows — scalars + location
  // names + lines count (the list UI shows a count, not the lines).
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.stockTransfer.findFirst({
          where: { tenantId, id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const rows = await prisma.stockTransfer.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: {
        fromLocation: { select: { id: true, name: true } },
        toLocation: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    });
    const data = rows.map(({ _count, ...rest }) => ({
      ...rest,
      linesCount: _count.lines,
    }));
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

  const transfers = await prisma.stockTransfer.findMany({
    where: { tenantId },
    include: {
      fromLocation: { select: { id: true, name: true } },
      toLocation: { select: { id: true, name: true } },
      lines: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(transfers));
});

interface TransferLineInput {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
}

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "products", "edit");
  if (denied) return denied;
  const featureDenied = await requireFeature(tenantId, "multi_location");
  if (featureDenied) return featureDenied;
  const body = (await req.json().catch(() => ({}))) as {
    from_location_id?: string;
    to_location_id?: string;
    notes?: string;
    lines?: TransferLineInput[];
  };

  const { from_location_id, to_location_id, lines } = body;

  if (!from_location_id || !to_location_id) {
    return NextResponse.json({ error: "Both source and destination locations are required" }, { status: 400 });
  }
  if (from_location_id === to_location_id) {
    return NextResponse.json({ error: "Source and destination must differ" }, { status: 400 });
  }
  if (!lines || lines.length === 0) {
    return NextResponse.json({ error: "At least one line is required" }, { status: 400 });
  }

  // Validate the two locations belong to the tenant.
  const locs = await prisma.location.findMany({
    where: { tenantId, id: { in: [from_location_id, to_location_id] } },
    select: { id: true },
  });
  if (locs.length !== 2) {
    return NextResponse.json({ error: "Invalid location" }, { status: 400 });
  }

  // Aggregate requested quantity per product/variant first, so the same item
  // appearing on multiple lines is validated against the source on its TOTAL
  // (checking each line independently would let duplicate lines mint stock).
  const requested = new Map<string, number>();
  for (const line of lines) {
    if (!line.product_id || !line.quantity || line.quantity <= 0) {
      return NextResponse.json({ error: "Each line needs a product and a positive quantity" }, { status: 400 });
    }
    const key = `${line.product_id}::${line.variant_id ?? ""}`;
    requested.set(key, (requested.get(key) ?? 0) + Math.round(line.quantity));
  }

  // Validate every referenced product/variant belongs to the tenant.
  const productIds = Array.from(new Set(lines.map((l) => l.product_id)));
  const products = await prisma.product.findMany({
    where: { tenantId, id: { in: productIds } },
    select: { id: true },
  });
  if (products.length !== productIds.length) {
    return NextResponse.json({ error: "One or more products do not exist" }, { status: 400 });
  }
  const variantIds = Array.from(
    new Set(lines.map((l) => l.variant_id).filter((id): id is string => !!id))
  );
  if (variantIds.length > 0) {
    const variants = await prisma.productVariant.findMany({
      where: { tenantId, id: { in: variantIds } },
      select: { id: true },
    });
    if (variants.length !== variantIds.length) {
      return NextResponse.json({ error: "One or more variants do not exist" }, { status: 400 });
    }
  }

  // Sentinel thrown inside the transaction when the source can't cover a line;
  // rolls the whole transfer back instead of clamping the out leg at zero
  // (clamping would credit the destination with stock never removed).
  const INSUFFICIENT = new Error("insufficient stock at source");

  let transfer;
  try {
    transfer = await prisma.$transaction(async (tx) => {
      // Re-check availability UNDER LOCK: `FOR UPDATE` on the source level rows
      // serializes concurrent transfers of the same item, so the pre-checked
      // quantity can't be spent by a racing request between check and apply.
      for (const [key, totalQty] of requested) {
        const [productId, variantId] = key.split("::");
        const level = await tx.stockLevel.findFirst({
          where: {
            locationId: from_location_id,
            productId,
            variantId: variantId || null,
          },
          select: { id: true },
        });
        let available = 0;
        if (level) {
          const locked = await tx.$queryRaw<Array<{ quantity: number }>>`
            SELECT "quantity" FROM "stock_levels" WHERE "id" = ${level.id} FOR UPDATE`;
          available = locked[0]?.quantity ?? 0;
        }
        if (available < totalQty) throw INSUFFICIENT;
      }
      const created = await tx.stockTransfer.create({
        data: {
          tenantId,
          transferNumber: generateTransferNumber(),
          fromLocationId: from_location_id,
          toLocationId: to_location_id,
          notes: body.notes || null,
          createdBy: session.userId,
          lines: {
            create: lines.map((l) => ({
              productId: l.product_id,
              variantId: l.variant_id ?? null,
              quantity: Math.round(l.quantity),
            })),
          },
        },
      });

      for (const line of lines) {
        const qty = Math.round(line.quantity);
        // Out of source (never clamps: availability was verified under lock above)
        await applyStockChange(tx, {
          tenantId,
          productId: line.product_id,
          variantId: line.variant_id ?? null,
          locationId: from_location_id,
          type: "transfer_out",
          quantityChange: -qty,
          referenceType: "stock_transfer",
          referenceId: created.id,
          userId: session.userId,
        });
        // Into destination
        await applyStockChange(tx, {
          tenantId,
          productId: line.product_id,
          variantId: line.variant_id ?? null,
          locationId: to_location_id,
          type: "transfer_in",
          quantityChange: qty,
          referenceType: "stock_transfer",
          referenceId: created.id,
          userId: session.userId,
        });
      }

      return created;
    });
  } catch (err) {
    if (err === INSUFFICIENT) {
      return NextResponse.json(
        { error: "Insufficient stock at source location for one or more items" },
        { status: 409 }
      );
    }
    throw err;
  }

  const full = await prisma.stockTransfer.findUnique({
    where: { id: transfer.id },
    include: {
      fromLocation: { select: { id: true, name: true } },
      toLocation: { select: { id: true, name: true } },
      lines: true,
    },
  });

  return NextResponse.json(toSnakeCase(full), { status: 201 });
});
