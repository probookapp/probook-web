import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { reminderSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId }) => {
  const reminders = await prisma.reminder.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(reminders));
});

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, reminderSchema);
  if (isValidationError(body)) return body;
  const reminder = await prisma.reminder.create({
    data: {
      tenantId,
      reminderType: body.reminder_type,
      documentType: body.document_type,
      documentId: body.document_id,
      scheduledDate: new Date(body.scheduled_date),
      message: body.message || null,
    },
  });
  return NextResponse.json(toSnakeCase(reminder));
});
