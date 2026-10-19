import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { supplierReturnSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import { createSupplierReturn, SupplierReturnError } from "@/lib/supplier-returns";

// Returns of goods to suppliers, kept by them as credit (see src/lib/supplier-returns.ts).
export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "purchases", "view");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get("supplier_id");
  const purchaseOrderId = searchParams.get("purchase_order_id");
  const where = {
    tenantId,
    ...(supplierId ? { supplierId } : {}),
    ...(purchaseOrderId ? { purchaseOrderId } : {}),
  };
  const include = {
    supplier: { select: { id: true, name: true } },
    purchaseOrder: { select: { id: true, orderNumber: true } },
    // An order page needs what was already sent back per line.
    ...(purchaseOrderId
      ? { lines: { select: { id: true, purchaseOrderLineId: true, quantity: true, total: true } } }
      : {}),
  };

  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.supplierReturn.findFirst({ where: { tenantId, id: page.cursor }, select: { id: true } }))?.id ?? null
      : null;
    const data = await prisma.supplierReturn.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include,
    });
    return NextResponse.json(toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) }));
  }

  const returns = await prisma.supplierReturn.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include,
  });
  return NextResponse.json(toSnakeCase(returns));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "purchases", "create");
  if (denied) return denied;
  const body = await validateBody(req, supplierReturnSchema);
  if (isValidationError(body)) return body;

  // The number is the day's next one: a concurrent return can take it first,
  // in which case the whole transaction is replayed with the following number.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await prisma.$transaction((tx) =>
        createSupplierReturn(tx, {
          tenantId,
          userId: session.userId,
          supplierId: body.supplier_id,
          purchaseOrderId: body.purchase_order_id || null,
          locationId: body.location_id || null,
          returnDate: body.return_date,
          reason: body.reason,
          notes: body.notes,
          lines: body.lines,
        })
      );
      return NextResponse.json(toSnakeCase(created));
    } catch (err) {
      if (err instanceof SupplierReturnError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
      }
      const isUniqueViolation = err && typeof err === "object" && "code" in err && err.code === "P2002";
      if (!isUniqueViolation || attempt === 2) throw err;
    }
  }
  return NextResponse.json({ error: "Failed to generate unique return number" }, { status: 500 });
});
