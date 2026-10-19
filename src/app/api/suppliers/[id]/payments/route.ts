import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { supplierPaymentSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import { num } from "@/lib/money";
import { getOrderSettled, refreshOrderPaymentStatus } from "@/lib/supplier-account";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const payments = await prisma.supplierPayment.findMany({
    where: { tenantId, supplierId: params?.id },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    include: { purchaseOrder: { select: { id: true, orderNumber: true } } },
  });
  return NextResponse.json(toSnakeCase(payments));
});

class PaymentError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// A payment either settles one order (received, or an advance on a pending
// one), up to what is left on it, or stands alone as money on account: credit
// the supplier holds for the business.
export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "suppliers", "edit");
  if (denied) return denied;
  const body = await validateBody(req, supplierPaymentSchema);
  if (isValidationError(body)) return body;

  const supplierId = params?.id as string;
  const supplier = await prisma.supplier.findFirst({
    where: { tenantId, id: supplierId },
    select: { id: true },
  });
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const payment = await prisma.$transaction(async (tx) => {
      if (body.purchase_order_id) {
        // Lock the order so two payments on it cannot both pass the check.
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "purchase_orders"
          WHERE "id" = ${body.purchase_order_id} AND "tenant_id" = ${tenantId}
            AND "supplier_id" = ${supplierId}
          FOR UPDATE`;
        if (locked.length === 0) {
          throw new PaymentError("Purchase order not found or does not belong to this supplier", 400);
        }
        const order = await tx.purchaseOrder.findFirstOrThrow({
          where: { tenantId, id: body.purchase_order_id },
          select: { id: true, status: true, total: true },
        });
        // A pending order can take an advance; a cancelled one takes nothing.
        if (order.status === "CANCELLED") {
          throw new PaymentError("A cancelled order cannot be paid", 400);
        }
        const settled = (await getOrderSettled(tx, tenantId, [order.id])).get(order.id) ?? 0;
        const remaining = num(order.total) - settled;
        if (body.amount > remaining + 0.005) {
          throw new PaymentError("Payment exceeds the amount left to pay on this order", 400);
        }
      }

      const created = await tx.supplierPayment.create({
        data: {
          tenantId,
          supplierId,
          purchaseOrderId: body.purchase_order_id || null,
          amount: body.amount,
          paymentDate: new Date(body.payment_date),
          paymentMethod: body.payment_method || "CASH",
          reference: body.reference || null,
          notes: body.notes || null,
        },
      });

      if (body.purchase_order_id) {
        await refreshOrderPaymentStatus(tx, tenantId, body.purchase_order_id);
      }
      return created;
    });
    return NextResponse.json(toSnakeCase(payment));
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});
