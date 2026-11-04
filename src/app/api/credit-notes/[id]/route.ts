import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { applyStockChange } from "@/lib/stock";

export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;
  const creditNote = await prisma.creditNote.findFirst({
    where: { tenantId, id: params?.id },
    include: {
      lines: true,
      client: true,
      invoice: true,
    },
  });
  if (!creditNote) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(creditNote));
});

export const DELETE = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "invoices", "delete");
  if (denied) return denied;

  const existing = await prisma.creditNote.findFirst({ where: { tenantId, id: params?.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // An issued credit note is an invoice in law: its number belongs to an
  // unbroken sequence and the document cannot disappear (CGI ann. II
  // art. 242 nonies A; Algerian decree 05-468 art. 10). It is cancelled by a
  // new invoice, never deleted. Only a draft can go.
  if (existing.status !== "DRAFT") {
    return NextResponse.json(
      { error: "An issued credit note cannot be deleted. Issue an invoice to cancel it.", code: "CREDIT_NOTE_ISSUED" },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    // If the credit note restocked returned items, reverse those ledger entries
    // before deleting so inventory doesn't keep the phantom stock. We negate the
    // exact movements this note produced (correct location + applied quantity).
    if (existing.restocked) {
      const movements = await tx.stockMovement.findMany({
        where: { tenantId, referenceType: "credit_note", referenceId: existing.id },
      });
      for (const m of movements) {
        if (m.quantityChange === 0) continue;
        await applyStockChange(tx, {
          tenantId,
          productId: m.productId,
          variantId: m.variantId,
          locationId: m.locationId,
          type: "adjustment",
          quantityChange: -m.quantityChange,
          reason: "Reverse credit note restock (deleted)",
          referenceType: "credit_note",
          referenceId: existing.id,
          userId: session.userId,
        });
      }
    }
    await tx.creditNote.delete({ where: { id: existing.id } });
  });

  return new NextResponse(null, { status: 204 });
});
