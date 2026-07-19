import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { requireFeature } from "@/lib/feature-gate";

export const GET = withAuth(async (_req, { tenantId }) => {
  const locations = await prisma.location.findMany({
    where: { tenantId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(toSnakeCase(locations));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "products", "create");
  if (denied) return denied;
  const featureDenied = await requireFeature(tenantId, "multi_location");
  if (featureDenied) return featureDenied;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    type?: string;
    address?: string;
    is_default?: boolean;
  };

  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const location = await prisma.$transaction(async (tx) => {
    if (body.is_default) {
      await tx.location.updateMany({ where: { tenantId }, data: { isDefault: false } });
    }
    return tx.location.create({
      data: {
        tenantId,
        name: body.name!.trim(),
        type: body.type === "warehouse" ? "warehouse" : "store",
        address: body.address || null,
        isDefault: Boolean(body.is_default),
        isActive: true,
      },
    });
  });

  return NextResponse.json(toSnakeCase(location), { status: 201 });
});
