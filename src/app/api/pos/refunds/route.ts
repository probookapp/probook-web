import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { posRefundSchema } from "@/lib/validations";
import { createCreditNote } from "@/lib/credit-notes";
import { requirePermission } from "@/lib/permissions-server";

// POS sales are often made to walk-in customers with no client record, but a
// credit note requires a client. We resolve/create a single per-tenant
// placeholder client for those refunds.
const POS_WALK_IN_CLIENT_NAME = "POS Walk-in customer";

async function resolveWalkInClientId(
  db: Parameters<typeof createCreditNote>[0],
  tenantId: string
): Promise<string> {
  const existing = await db.client.findFirst({
    where: { tenantId, name: POS_WALK_IN_CLIENT_NAME },
  });
  if (existing) return existing.id;
  const created = await db.client.create({
    data: { tenantId, name: POS_WALK_IN_CLIENT_NAME },
  });
  return created.id;
}

const lineKey = (
  productId: string | null | undefined,
  variantId: string | null | undefined,
  designation: string
) => `${productId ?? ""}::${variantId ?? ""}::${designation}`;

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "pos", "delete");
  if (denied) return denied;
  const body = await validateBody(req, posRefundSchema);
  if (isValidationError(body)) return body;

  const transaction = await prisma.posTransaction.findFirst({
    where: { tenantId, id: body.transaction_id },
    include: { lines: true, payments: true },
  });
  if (!transaction) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }
  if (transaction.status === "CANCELLED") {
    return NextResponse.json({ error: "Cannot refund a cancelled transaction" }, { status: 400 });
  }

  // Sold quantity per line (keyed by product/variant/designation), with a
  // representative original line for authoritative price/tax.
  const soldByKey = new Map<string, { qty: number; line: (typeof transaction.lines)[number] }>();
  for (const l of transaction.lines) {
    const k = lineKey(l.productId, l.variantId, l.designation);
    const cur = soldByKey.get(k);
    if (cur) cur.qty += l.quantity;
    else soldByKey.set(k, { qty: l.quantity, line: l });
  }

  // Quantities already refunded across prior credit notes for THIS sale.
  const priorNotes = await prisma.creditNote.findMany({
    where: { tenantId, posTransactionId: transaction.id },
    include: { lines: true },
  });
  const refundedByKey = new Map<string, number>();
  for (const n of priorNotes) {
    for (const cl of n.lines) {
      const k = lineKey(cl.productId, cl.variantId, cl.description);
      refundedByKey.set(k, (refundedByKey.get(k) ?? 0) + cl.quantity);
    }
  }

  // Transaction-level discount ratio: the customer paid finalAmount for a sale
  // whose lines summed to `total`, so each line's refundable value is scaled by
  // finalAmount/total (covers both percentage and flat discounts).
  const ratio = transaction.total > 0 ? transaction.finalAmount / transaction.total : 1;

  // Rebuild the refund lines from the ORIGINAL sale (never trust client prices),
  // and cap each at what's still refundable.
  const refundLines: {
    product_id: string | null;
    variant_id: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
  }[] = [];
  for (const reqLine of body.lines) {
    if (!reqLine.quantity || reqLine.quantity <= 0) continue;
    const k = lineKey(reqLine.product_id ?? null, reqLine.variant_id ?? null, reqLine.description);
    const sold = soldByKey.get(k);
    if (!sold) {
      return NextResponse.json(
        { error: "A refund line does not match the original sale" },
        { status: 400 }
      );
    }
    const already = refundedByKey.get(k) ?? 0;
    const remaining = sold.qty - already;
    if (reqLine.quantity > remaining + 1e-6) {
      return NextResponse.json(
        { error: "Refund quantity exceeds what remains refundable for one or more items" },
        { status: 400 }
      );
    }
    const effectiveUnit =
      (sold.line.quantity > 0 ? sold.line.subtotal / sold.line.quantity : sold.line.unitPrice) * ratio;
    refundLines.push({
      product_id: sold.line.productId,
      variant_id: sold.line.variantId,
      description: sold.line.designation,
      quantity: reqLine.quantity,
      unit_price: Math.round(effectiveUnit * 100) / 100,
      tax_rate: sold.line.taxRate,
    });
    // Guard against the same item appearing twice in one request.
    refundedByKey.set(k, already + reqLine.quantity);
  }
  if (refundLines.length === 0) {
    return NextResponse.json({ error: "No valid refund lines" }, { status: 400 });
  }

  // Restock returned items to the register's location (falls back to default).
  const register = transaction.registerId
    ? await prisma.posRegister.findFirst({
        where: { tenantId, id: transaction.registerId },
        select: { locationId: true },
      })
    : null;
  const refundLocationId = register?.locationId ?? null;
  const paidInCash = transaction.payments.some((p) => p.paymentMethod === "CASH");

  const creditNote = await prisma.$transaction(async (tx) => {
    const clientId = transaction.clientId ?? (await resolveWalkInClientId(tx, tenantId));
    const cn = await createCreditNote(tx, {
      tenantId,
      userId: session.userId,
      clientId,
      invoiceId: transaction.invoiceId || null,
      posTransactionId: transaction.id,
      issueDate: new Date(),
      reason: body.reason || `Refund for ticket ${transaction.ticketNumber}`,
      notes: body.notes || null,
      restock: !!body.restock,
      locationId: refundLocationId,
      lines: refundLines,
    });

    // A cash refund reduces the drawer. Post an OUT movement to the sale's
    // session while it's still OPEN (same-session refund — the common case);
    // a refund against an already-closed session can't touch that drawer.
    if (paidInCash) {
      const openSession = await tx.posSession.findFirst({
        where: { tenantId, id: transaction.sessionId, status: "OPEN" },
        select: { id: true },
      });
      if (openSession) {
        await tx.posCashMovement.create({
          data: {
            tenantId,
            sessionId: openSession.id,
            userId: session.userId,
            movementType: "OUT",
            amount: cn.total,
            reason: `Refund for ticket ${transaction.ticketNumber}`,
            reference: cn.creditNoteNumber,
          },
        });
      }
    }

    return cn;
  });

  return NextResponse.json(toSnakeCase(creditNote));
});
