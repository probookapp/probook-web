import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { appSettingsSchema } from "@/lib/validations";

export const PUT = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, appSettingsSchema);
  if (isValidationError(body)) return body;

  const updateData: Record<string, unknown> = {};
  if (body.app_language !== undefined) updateData.appLanguage = body.app_language;
  if (body.app_theme !== undefined) updateData.appTheme = body.app_theme;
  if (body.currency !== undefined) updateData.currency = body.currency;

  const settings = await prisma.companySettings.upsert({
    where: { tenantId },
    update: updateData,
    create: { tenantId, ...updateData },
  });

  return NextResponse.json(toSnakeCase(settings));
});
