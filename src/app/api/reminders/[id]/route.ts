import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { reminderSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const reminder = await prisma.reminder.findFirst({ where: { tenantId, id: params?.id } });
  if (!reminder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(reminder));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
  const body = await validateBody(req, reminderSchema);
  if (isValidationError(body)) return body;
  const reminder = await prisma.reminder.update({
    where: { tenantId, id: params?.id },
    data: {
      reminderType: body.reminder_type,
      documentType: body.document_type,
      documentId: body.document_id,
      scheduledDate: new Date(body.scheduled_date),
      message: body.message || null,
    },
  });
  return NextResponse.json(toSnakeCase(reminder));
});

export const DELETE = withAuth(async (req, { tenantId, params }) => {
  await prisma.reminder.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
