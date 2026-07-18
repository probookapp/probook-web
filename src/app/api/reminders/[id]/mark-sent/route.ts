import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { reminderDocumentModule } from "../../reminders-shared";

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const existing = await prisma.reminder.findFirst({ where: { tenantId, id: params?.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const permModule = reminderDocumentModule(existing.documentType) || "dashboard";
  const denied = await requirePermission(session, permModule, "edit");
  if (denied) return denied;

  const reminder = await prisma.reminder.update({
    where: { tenantId, id: params?.id },
    data: { sentAt: new Date() },
  });
  return NextResponse.json(toSnakeCase(reminder));
});
