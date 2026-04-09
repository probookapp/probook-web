import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { purchaseOrderSchema } from "@/lib/validations";

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

export const GET = withAuth(async (req, { tenantId }) => {
  const orders = await prisma.purchaseOrder.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: true,
      lines: { include: { product: true, variant: true } },
    },
  });
  return NextResponse.json(toSnakeCase(orders));
});

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, purchaseOrderSchema);
  if (isValidationError(body)) return body;

  // Generate order number
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await prisma.purchaseOrder.count({
    where: {
      tenantId,
      createdAt: {
        gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    },
  });
  const orderNumber = `PO-${today}-${String(count + 1).padStart(4, "0")}`;

  // Calculate totals from lines
  const lines = body.lines || [];
  let subtotal = 0;
  let taxAmount = 0;
  for (const line of lines) {
    const lineSubtotal = line.quantity * line.unit_price;
    const lineTax = lineSubtotal * (line.tax_rate || 0) / 100;
    subtotal += lineSubtotal;
    taxAmount += lineTax;
  }
  const total = subtotal + taxAmount;

  const order = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      orderNumber,
      supplierId: body.supplier_id,
      orderDate: body.order_date ? new Date(body.order_date) : new Date(),
      status: "PENDING",
      paymentStatus: "UNPAID",
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

  return NextResponse.json(toSnakeCase(order));
});
