import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { purchaseOrderSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

interface LineInput {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  unit_price: number;
  previous_price?: number | null;
  use_average_price?: boolean;
  tax_rate?: number;
}

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "purchases", "view");
  if (denied) return denied;

  // Opt-in cursor pagination (audit SALE-23): lean rows — scalars + supplier
  // name, no line arrays (the confirm/edit flows load lines per order).
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.purchaseOrder.findFirst({
          where: { tenantId, id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const data = await prisma.purchaseOrder.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: { supplier: { select: { id: true, name: true } } },
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

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

async function generateOrderNumber(tenantId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  // Use max order number for today to avoid TOCTOU race
  const latest = await prisma.purchaseOrder.findFirst({
    where: {
      tenantId,
      orderNumber: { startsWith: `PO-${today}-` },
    },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });

  let seq = 1;
  if (latest) {
    const lastSeq = parseInt(latest.orderNumber.split("-").pop() || "0", 10);
    seq = lastSeq + 1;
  }
  return `PO-${today}-${String(seq).padStart(4, "0")}`;
}

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "purchases", "create");
  if (denied) return denied;
  const body = await validateBody(req, purchaseOrderSchema);
  if (isValidationError(body)) return body;

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

  // Retry loop for unique constraint violation on order number
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const orderNumber = await generateOrderNumber(tenantId);
    try {
      const order = await prisma.purchaseOrder.create({
        data: {
          tenantId,
          orderNumber,
          supplierId: body.supplier_id,
          orderDate: body.order_date ? new Date(body.order_date) : new Date(),
          locationId: body.location_id || null,
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
    } catch (err) {
      // P2002 = unique constraint violation
      const isUniqueViolation = err && typeof err === "object" && "code" in err && err.code === "P2002";
      if (!isUniqueViolation || attempt === MAX_RETRIES - 1) throw err;
      // Retry with next sequence number
    }
  }

  return NextResponse.json({ error: "Failed to generate unique order number" }, { status: 500 });
});
