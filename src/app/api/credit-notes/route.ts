import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { createCreditNoteSchema } from "@/lib/validations";
import { createCreditNote, CreditNoteError } from "@/lib/credit-notes";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;

  // Opt-in cursor pagination (audit SALE-23): lean rows — scalars + client
  // name + linked invoice number, no line arrays.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.creditNote.findFirst({
          where: { tenantId, id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const data = await prisma.creditNote.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: {
        client: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

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

  try {
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
  } catch (err) {
    if (err instanceof CreditNoteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});
