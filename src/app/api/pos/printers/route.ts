import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { posPrinterSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId }) => {
  const configs = await prisma.posPrinterConfig.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(configs));
});

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, posPrinterSchema);
  if (isValidationError(body)) return body;
  const config = await prisma.posPrinterConfig.create({
    data: {
      tenantId,
      registerId: body.register_id || null,
      printerName: body.printer_name,
      connectionType: body.connection_type,
      connectionAddress: body.connection_address,
      paperWidth: body.paper_width ?? 80,
      isDefault: body.is_default ?? false,
      isActive: body.is_active ?? true,
    },
  });
  return NextResponse.json(toSnakeCase(config));
});
