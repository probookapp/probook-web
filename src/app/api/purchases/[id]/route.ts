import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { rejectUnstockableProducts } from "@/lib/bundles-server";
import { purchaseOrderSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import { refreshOrderPaymentStatus } from "@/lib/supplier-account";

interface LineInput {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  unit_price: number;
  previous_price?: number | null;
  use_average_price?: boolean;
  tax_rate?: number;
  [key: string]: unknown;
}

export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "purchases", "view");
  if (denied) return denied;
  const order = await prisma.purchaseOrder.findFirst({
    where: { tenantId, id: params?.id },
    include: {
      supplier: true,
      lines: { include: { product: true, variant: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(order));
});

export const PUT = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "purchases", "edit");
  if (denied) return denied;
  const existing = await prisma.purchaseOrder.findFirst({
    where: { tenantId, id: params?.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "PENDING") {
    return NextResponse.json({ error: "Only PENDING orders can be updated" }, { status: 400 });
  }

  const body = await validateBody(req, purchaseOrderSchema);
  if (isValidationError(body)) return body;

  const lines = body.lines || [];
  const unstockable = await rejectUnstockableProducts(tenantId, lines.map((l) => l.product_id));
  if (unstockable) return unstockable;
  let subtotal = 0;
  let taxAmount = 0;
  for (const line of lines) {
    const lineSubtotal = line.quantity * line.unit_price;
    const lineTax = lineSubtotal * (line.tax_rate || 0) / 100;
    subtotal += lineSubtotal;
    taxAmount += lineTax;
  }
  const total = subtotal + taxAmount;

  await prisma.purchaseOrderLine.deleteMany({ where: { orderId: params?.id } });

  const order = await prisma.purchaseOrder.update({
    where: { tenantId, id: params?.id },
    data: {
      supplierId: body.supplier_id,
      orderDate: body.order_date ? new Date(body.order_date) : existing.orderDate,
      locationId: body.location_id || null,
      subtotal,
      taxAmount,
      total,
      notes: body.notes || null,
      lines: {
        create: lines.map((l: LineInput) => {
          const lineSubtotal = l.quantity * l.unit_price;
          const lineTax = lineSubtotal * (l.tax_rate || 0) / 100;
          return {
            productId: l.product_id,
            variantId: l.variant_id || null,
            quantity: l.quantity,
            unitPrice: l.unit_price,
            previousPrice: l.previous_price ?? null,
            useAveragePrice: l.use_average_price || false,
            taxRate: l.tax_rate || 0,
            subtotal: lineSubtotal,
            taxAmount: lineTax,
            total: lineSubtotal + lineTax,
          };
        }),
      },
    },
    include: { lines: true },
  });
  // An advance may already sit on it: a new total moves its payment status.
  await refreshOrderPaymentStatus(prisma, tenantId, order.id);

  return NextResponse.json(toSnakeCase(order));
});

export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "purchases", "delete");
  if (denied) return denied;
  const existing = await prisma.purchaseOrder.findFirst({
    where: { tenantId, id: params?.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "PENDING") {
    return NextResponse.json({ error: "Only PENDING orders can be deleted" }, { status: 400 });
  }
  // An advance already paid on it stays on the supplier's account: the order
  // can be cancelled, not erased from under its payment.
  const paid = await prisma.supplierPayment.count({ where: { tenantId, purchaseOrderId: existing.id } });
  if (paid > 0) {
    return NextResponse.json(
      { error: "Cannot delete an order with payments: cancel it instead", code: "HAS_PAYMENTS" },
      { status: 409 }
    );
  }

  await prisma.purchaseOrder.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
