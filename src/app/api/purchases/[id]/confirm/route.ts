import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { confirmPurchaseOrderSchema } from "@/lib/validations";

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const body = await validateBody(req, confirmPurchaseOrderSchema);
  if (isValidationError(body)) return body;

  // Pre-flight validation outside transaction
  if (body.paid_from_register) {
    if (!body.register_id || !body.session_id) {
      return NextResponse.json(
        { error: "register_id and session_id are required when paying from register" },
        { status: 400 }
      );
    }

    const posSession = await prisma.posSession.findFirst({
      where: { id: body.session_id, tenantId, status: "OPEN" },
    });
    if (!posSession) {
      return NextResponse.json({ error: "POS session not found or not open" }, { status: 400 });
    }
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
    // Lock the order row and verify status atomically
    const order = await tx.purchaseOrder.findFirst({
      where: { tenantId, id: params?.id, status: "PENDING" },
      include: { lines: true },
    });
    if (!order) {
      throw new Error("NOT_FOUND_OR_NOT_PENDING");
    }

    let paymentStatus = "UNPAID";
    let paidFromRegister = false;

    if (body.paid_from_register) {
      await tx.posCashMovement.create({
        data: {
          tenantId,
          sessionId: body.session_id!,
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
        // Read current variant stock, then set new value with floor
        const variant = await tx.productVariant.findUniqueOrThrow({
          where: { id: line.variantId },
        });
        await tx.productVariant.update({
          where: { id: line.variantId },
          data: { quantity: variant.quantity + qty },
        });
      } else {
        // Read current product BEFORE incrementing for avg price calc
        const product = await tx.product.findUniqueOrThrow({
          where: { id: line.productId },
        });
        const oldQty = product.quantity ?? 0;
        const oldPrice = product.purchasePrice ?? 0;
        const newQty = oldQty + qty;

        let newPurchasePrice = line.unitPrice;
        if (line.useAveragePrice && newQty > 0) {
          newPurchasePrice = ((oldQty * oldPrice) + (qty * line.unitPrice)) / newQty;
        }

        await tx.product.update({
          where: { tenantId, id: line.productId },
          data: {
            quantity: newQty,
            purchasePrice: newPurchasePrice,
          },
        });
      }
    }

    return tx.purchaseOrder.update({
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
  });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND_OR_NOT_PENDING") {
      return NextResponse.json({ error: "Order not found or not in PENDING status" }, { status: 400 });
    }
    throw err;
  }

  return NextResponse.json(toSnakeCase(updated));
});
