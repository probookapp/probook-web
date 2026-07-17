import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { createCreditNoteSchema } from "@/lib/validations";
import { createCreditNote } from "@/lib/credit-notes";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;
  const creditNotes = await prisma.creditNote.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      lines: true,
      client: true,
      invoice: true,
    },
  });
  return NextResponse.json(toSnakeCase(creditNotes));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "invoices", "create");
  if (denied) return denied;
  const body = await validateBody(req, createCreditNoteSchema);
  if (isValidationError(body)) return body;

  const creditNote = await prisma.$transaction((tx) =>
    createCreditNote(tx, {
      tenantId,
      userId: session.userId,
      clientId: body.client_id,
      invoiceId: body.invoice_id || null,
      issueDate: body.issue_date,
      reason: body.reason || null,
      notes: body.notes || null,
      restock: !!body.restock,
      lines: body.lines,
    })
  );

  return NextResponse.json(toSnakeCase(creditNote));
});
