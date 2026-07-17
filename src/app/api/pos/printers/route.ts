import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { posPrinterSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId }) => {
  const configs = await prisma.posPrinterConfig.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(configs));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "pos", "create");
  if (denied) return denied;
  const body = await validateBody(req, posPrinterSchema);
  if (isValidationError(body)) return body;
  const registerId = body.register_id || null;
  const config = await prisma.$transaction(async (tx) => {
    // At most one default printer per register (null register = the tenant-wide scope).
    if (body.is_default) {
      await tx.posPrinterConfig.updateMany({
        where: { tenantId, registerId },
        data: { isDefault: false },
      });
    }
    return tx.posPrinterConfig.create({
      data: {
        tenantId,
        registerId,
        printerName: body.printer_name,
        connectionType: body.connection_type,
        connectionAddress: body.connection_address,
        paperWidth: body.paper_width ?? 80,
        isDefault: body.is_default ?? false,
        isActive: body.is_active ?? true,
      },
    });
  });
  return NextResponse.json(toSnakeCase(config));
});
