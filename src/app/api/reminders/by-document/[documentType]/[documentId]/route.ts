import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { reminderDocumentModule } from "../../../reminders-shared";

export const GET = withAuth(async (req, { tenantId, params, session }) => {
  const documentType = (params?.documentType || "").toLowerCase();
  const permModule = reminderDocumentModule(documentType);
  if (!permModule) {
    return NextResponse.json(
      { error: `Invalid document type: ${params?.documentType}` },
      { status: 400 }
    );
  }
  const denied = await requirePermission(session, permModule, "view");
  if (denied) return denied;

  const reminders = await prisma.reminder.findMany({
    where: {
      tenantId,
      documentType,
      documentId: params?.documentId,
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(reminders));
});
