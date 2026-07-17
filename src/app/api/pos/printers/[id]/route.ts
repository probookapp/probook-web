import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { updatePosPrinterSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

export const PUT = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "pos", "edit");
  if (denied) return denied;
  const body = await validateBody(req, updatePosPrinterSchema);
  if (isValidationError(body)) return body;
  const config = await prisma.posPrinterConfig.update({
    where: { tenantId, id: params?.id },
    data: {
      registerId: body.register_id || null,
      printerName: body.printer_name,
      connectionType: body.connection_type,
      connectionAddress: body.connection_address,
      paperWidth: body.paper_width ?? 80,
      isDefault: body.is_default,
      isActive: body.is_active,
    },
  });
  return NextResponse.json(toSnakeCase(config));
});

export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "pos", "delete");
  if (denied) return denied;
  await prisma.posPrinterConfig.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
