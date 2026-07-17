import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";

export const PUT = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "products", "edit");
  if (denied) return denied;
  const id = params?.id;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    type?: string;
    address?: string;
    is_active?: boolean;
    is_default?: boolean;
  };

  const existing = await prisma.location.findFirst({ where: { id, tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (body.is_default) {
      await tx.location.updateMany({ where: { tenantId }, data: { isDefault: false } });
    }
    return tx.location.update({
      where: { id },
      data: {
        name: body.name?.trim() || existing.name,
        type: body.type ? (body.type === "warehouse" ? "warehouse" : "store") : existing.type,
        address: body.address !== undefined ? body.address : existing.address,
        isActive: body.is_active !== undefined ? body.is_active : existing.isActive,
        // Keep at least the default flag; only set true here (can't unset the last default).
        isDefault: body.is_default ? true : existing.isDefault,
      },
    });
  });

  return NextResponse.json(toSnakeCase(updated));
});

export const DELETE = withAuth(async (_req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "products", "delete");
  if (denied) return denied;
  const id = params?.id;

  const existing = await prisma.location.findFirst({ where: { id, tenantId } });
  if (!existing) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }
  if (existing.isDefault) {
    return NextResponse.json({ error: "Cannot delete the default location" }, { status: 400 });
  }

  const count = await prisma.location.count({ where: { tenantId } });
  if (count <= 1) {
    return NextResponse.json({ error: "Cannot delete the only location" }, { status: 400 });
  }

  // Block deletion while the location still holds stock — transfer it out first.
  const hasStock = await prisma.stockLevel.findFirst({
    where: { locationId: id, quantity: { not: 0 } },
    select: { id: true },
  });
  if (hasStock) {
    return NextResponse.json(
      { error: "Location still holds stock. Transfer it out before deleting." },
      { status: 400 }
    );
  }

  // A location referenced by past stock transfers can't be hard-deleted (RESTRICT
  // FK). Surface a friendly error instead of leaking a raw Prisma 500.
  try {
    await prisma.location.delete({ where: { id } });
  } catch {
    return NextResponse.json(
      { error: "Location is referenced by past stock transfers and can't be deleted. Deactivate it instead." },
      { status: 400 }
    );
  }
  return new NextResponse(null, { status: 204 });
});
