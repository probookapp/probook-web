import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { confirmPurchaseOrderSchema } from "@/lib/validations";

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const body = await validateBody(req, confirmPurchaseOrderSchema);
  if (isValidationError(body)) return body;

  const order = await prisma.purchaseOrder.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.status !== "PENDING") {
    return NextResponse.json({ error: "Only PENDING orders can be confirmed" }, { status: 400 });
  }

  let paymentStatus = "UNPAID";
  let paidFromRegister = false;

  if (body.paid_from_register) {
    if (!body.register_id || !body.session_id) {
      return NextResponse.json(
        { error: "register_id and session_id are required when paying from register" },
        { status: 400 }
      );
    }

    const posSession = await prisma.posSession.findFirst({
      where: { id: body.session_id, status: "OPEN" },
    });
    if (!posSession) {
      return NextResponse.json({ error: "POS session not found or not open" }, { status: 400 });
    }

    await prisma.posCashMovement.create({
      data: {
        tenantId,
        sessionId: body.session_id,
        userId: session.userId,
        movementType: "CASH_OUT",
        amount: order.total,
        reason: `Purchase Order ${order.orderNumber}`,
      },
    });

    paymentStatus = "PAID";
    paidFromRegister = true;
  }

  // Update stock and prices for each line
  for (const line of order.lines) {
    const qty = Math.round(line.quantity);
    if (line.variantId) {
      await prisma.productVariant.update({
        where: { id: line.variantId },
        data: { quantity: { increment: qty } },
      });
    } else {
      await prisma.product.update({
        where: { tenantId, id: line.productId },
        data: { quantity: { increment: qty } },
      });
    }

    if (line.useAveragePrice && !line.variantId) {
      const product = await prisma.product.findFirst({
        where: { tenantId, id: line.productId },
      });
      if (product) {
        const oldQty = (product.quantity ?? 0) - qty; // quantity already incremented above
        const oldPrice = product.purchasePrice || 0;
        const totalQty = oldQty + qty;
        const newAvg = totalQty > 0
          ? ((oldQty * oldPrice) + (qty * line.unitPrice)) / totalQty
          : line.unitPrice;
        await prisma.product.update({
          where: { tenantId, id: line.productId },
          data: { purchasePrice: newAvg },
        });
      }
    } else if (!line.useAveragePrice && !line.variantId) {
      await prisma.product.update({
        where: { tenantId, id: line.productId },
        data: { purchasePrice: line.unitPrice },
      });
    }
  }

  const updated = await prisma.purchaseOrder.update({
    where: { tenantId, id: params?.id },
    data: {
      status: "CONFIRMED",
      confirmedDate: new Date(),
      paymentStatus,
      paidFromRegister,
      registerId: body.register_id || null,
      sessionId: body.session_id || null,
    },
    include: {
      supplier: true,
      lines: { include: { product: true, variant: true } },
    },
  });

  return NextResponse.json(toSnakeCase(updated));
});
