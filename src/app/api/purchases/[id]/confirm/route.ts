import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { applyStockChange } from "@/lib/stock";
import { validateBody, isValidationError } from "@/lib/validate";
import { requirePermission } from "@/lib/permissions-server";

// Confirm / receive a purchase order. Supports partial goods receipt: pass a
// `lines` array with the cumulative received quantity per line. When `lines` is
// omitted the order is fully received ("receive all" — the default quick action).
const confirmReceiptSchema = z.object({
  paid_from_register: z.boolean(),
  register_id: z.string().nullable().optional(),
  session_id: z.string().nullable().optional(),
  lines: z
    .array(
      z.object({
        line_id: z.string().min(1),
        // Cumulative total received for the line (the new receivedQuantity value).
        received_quantity: z.coerce.number().min(0),
      })
    )
    .optional(),
});

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "purchases", "edit");
  if (denied) return denied;
  const body = await validateBody(req, confirmReceiptSchema);
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

  const receiptMap = new Map<string, number>(
    (body.lines ?? []).map((l) => [l.line_id, l.received_quantity])
  );
  const receiveAll = !body.lines;

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      // Lock the order row and verify status atomically. A PARTIALLY_RECEIVED
      // order can still receive its remaining quantities.
      const order = await tx.purchaseOrder.findFirst({
        where: { tenantId, id: params?.id, status: { in: ["PENDING", "PARTIALLY_RECEIVED"] } },
        include: { lines: true },
      });
      if (!order) {
        throw new Error("NOT_FOUND_OR_NOT_PENDING");
      }

      let paymentStatus = order.paymentStatus;
      let paidFromRegister = order.paidFromRegister;

      let allReceived = true;

      // Value accounting for proportional register debits. Each line's value is
      // qty × unit price incl. tax; the till is only debited for the share of
      // the order value actually received in this receipt.
      let orderedValue = 0;
      let prevReceivedValue = 0;
      let newReceivedValue = 0;

      // Update stock and prices for each line based on the newly-received delta.
      for (const line of order.lines) {
        const orderedQty = Math.round(line.quantity);
        const prevReceived = Math.round(line.receivedQuantity ?? 0);

        let target = receiveAll
          ? orderedQty
          : receiptMap.has(line.id)
            ? Math.round(receiptMap.get(line.id)!)
            : prevReceived;
        // Never receive more than ordered.
        target = Math.max(0, Math.min(orderedQty, target));

        const delta = target - prevReceived;

        const unitPriceInclTax = line.unitPrice * (1 + (line.taxRate ?? 0) / 100);
        orderedValue += orderedQty * unitPriceInclTax;
        prevReceivedValue += prevReceived * unitPriceInclTax;
        newReceivedValue += target * unitPriceInclTax;

        if (delta !== 0) {
          if (!line.variantId && delta > 0) {
            // Product line: recompute purchase price (weighted average or last price)
            // using only the newly-received quantity, then apply the stock delta.
            const product = await tx.product.findUniqueOrThrow({
              where: { id: line.productId },
            });
            const oldQty = product.quantity ?? 0;
            const oldPrice = product.purchasePrice ?? 0;
            const newQty = oldQty + delta;

            let newPurchasePrice = line.unitPrice;
            if (line.useAveragePrice && newQty > 0) {
              newPurchasePrice = ((oldQty * oldPrice) + (delta * line.unitPrice)) / newQty;
            }

            await applyStockChange(tx, {
              tenantId,
              productId: line.productId,
              locationId: order.locationId,
              type: "purchase",
              quantityChange: delta,
              referenceType: "purchase_order",
              referenceId: order.id,
              userId: session.userId,
            });

            await tx.product.update({
              where: { tenantId, id: line.productId },
              data: { purchasePrice: newPurchasePrice },
            });
          } else {
            await applyStockChange(tx, {
              tenantId,
              productId: line.productId,
              variantId: line.variantId ?? null,
              locationId: order.locationId,
              type: "purchase",
              quantityChange: delta,
              referenceType: "purchase_order",
              referenceId: order.id,
              userId: session.userId,
            });
          }
        }

        if (target < orderedQty) allReceived = false;

        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { receivedQuantity: target },
        });
      }

      const status = allReceived ? "CONFIRMED" : "PARTIALLY_RECEIVED";

      // Debit the register proportionally to the value received in this
      // receipt, accumulating across partial receipts. Cumulative debits are
      // derived from order.total × (received value / ordered value), so the
      // sum of all debits equals exactly order.total once fully received.
      if (body.paid_from_register) {
        const round2 = (n: number) => Math.round(n * 100) / 100;
        const debitedSoFar =
          orderedValue > 0 ? round2((order.total * prevReceivedValue) / orderedValue) : 0;
        const debitedAfter =
          orderedValue > 0 ? round2((order.total * newReceivedValue) / orderedValue) : 0;
        const amount = round2(debitedAfter - debitedSoFar);

        if (amount > 0) {
          await tx.posCashMovement.create({
            data: {
              tenantId,
              sessionId: body.session_id!,
              userId: session.userId,
              movementType: "OUT",
              amount,
              reason: `Purchase Order ${order.orderNumber}`,
            },
          });
        }

        paidFromRegister = true;
        paymentStatus = allReceived
          ? "PAID"
          : newReceivedValue > 0
            ? "PARTIAL"
            : paymentStatus;
      }

      return tx.purchaseOrder.update({
        where: { tenantId, id: params?.id },
        data: {
          status,
          confirmedDate: allReceived ? new Date() : order.confirmedDate,
          paymentStatus,
          paidFromRegister,
          registerId: paidFromRegister ? (body.register_id ?? order.registerId) : order.registerId,
          sessionId: paidFromRegister ? (body.session_id ?? order.sessionId) : order.sessionId,
        },
        include: {
          supplier: true,
          lines: { include: { product: true, variant: true } },
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND_OR_NOT_PENDING") {
      return NextResponse.json({ error: "Order not found or not in a receivable status" }, { status: 400 });
    }
    throw err;
  }

  return NextResponse.json(toSnakeCase(updated));
});
