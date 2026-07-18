import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { reminderSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import {
  REMINDER_TYPES,
  reminderDocumentModule,
  reminderDocumentExists,
} from "../reminders-shared";

export const GET = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "dashboard", "view");
  if (denied) return denied;
  const reminder = await prisma.reminder.findFirst({ where: { tenantId, id: params?.id } });
  if (!reminder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(reminder));
});

export const PUT = withAuth(async (req, { tenantId, params, session }) => {
  const existing = await prisma.reminder.findFirst({ where: { tenantId, id: params?.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await validateBody(req, reminderSchema);
  if (isValidationError(body)) return body;

  const reminderType = body.reminder_type.toLowerCase();
  const documentType = body.document_type.toLowerCase();
  if (!REMINDER_TYPES.has(reminderType)) {
    return NextResponse.json(
      { error: `Invalid reminder type: ${body.reminder_type}` },
      { status: 400 }
    );
  }
  const permModule = reminderDocumentModule(documentType);
  if (!permModule) {
    return NextResponse.json(
      { error: `Invalid document type: ${body.document_type}` },
      { status: 400 }
    );
  }
  const scheduledDate = new Date(body.scheduled_date);
  if (isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: "Invalid scheduled date" }, { status: 400 });
  }

  const denied = await requirePermission(session, permModule, "edit");
  if (denied) return denied;

  if (!(await reminderDocumentExists(tenantId, documentType, body.document_id))) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const reminder = await prisma.reminder.update({
    where: { tenantId, id: params?.id },
    data: {
      reminderType,
      documentType,
      documentId: body.document_id,
      scheduledDate,
      message: body.message || null,
    },
  });
  return NextResponse.json(toSnakeCase(reminder));
});

export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const reminder = await prisma.reminder.findFirst({ where: { tenantId, id: params?.id } });
  if (!reminder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const permModule = reminderDocumentModule(reminder.documentType) || "dashboard";
  const denied = await requirePermission(session, permModule, "edit");
  if (denied) return denied;

  await prisma.reminder.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
