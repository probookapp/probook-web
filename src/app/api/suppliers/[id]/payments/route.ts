import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { supplierPaymentSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const payments = await prisma.supplierPayment.findMany({
    where: { tenantId, supplierId: params?.id },
    orderBy: { paymentDate: "desc" },
  });
  return NextResponse.json(toSnakeCase(payments));
});

export const POST = withAuth(async (req, { tenantId, params }) => {
  const body = await validateBody(req, supplierPaymentSchema);
  if (isValidationError(body)) return body;

  const supplierId = params?.id as string;

  // Validate linked order belongs to this supplier
  if (body.purchase_order_id) {
    const order = await prisma.purchaseOrder.findFirst({
      where: { tenantId, id: body.purchase_order_id, supplierId },
    });
    if (!order) {
      return NextResponse.json(
        { error: "Purchase order not found or does not belong to this supplier" },
        { status: 400 }
      );
    }
  }

  const payment = await prisma.supplierPayment.create({
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

  // Update purchase order payment status if linked
  if (body.purchase_order_id) {
    const order = await prisma.purchaseOrder.findFirst({
      where: { tenantId, id: body.purchase_order_id },
    });
    if (order) {
      const totalPayments = await prisma.supplierPayment.aggregate({
        where: { tenantId, purchaseOrderId: body.purchase_order_id },
        _sum: { amount: true },
      });
      const paidAmount = totalPayments._sum.amount || 0;
      const newStatus = paidAmount >= order.total ? "PAID" : "PARTIAL";
      await prisma.purchaseOrder.update({
        where: { tenantId, id: body.purchase_order_id },
        data: { paymentStatus: newStatus },
      });
    }
  }

  return NextResponse.json(toSnakeCase(payment));
});
