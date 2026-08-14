import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { calculateDocumentTotals, calculateLineTotals } from "@/lib/document-totals";
import { validateBody, isValidationError } from "@/lib/validate";
import { updateQuoteSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";

interface LineInput {
  product_id?: string | null;
  description: string;
  description_html?: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  position?: number;
  group_name?: string | null;
  is_subtotal_line?: boolean;
  discount_percent?: number | null;
}


export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "quotes", "view");
  if (denied) return denied;
  const quote = await prisma.quote.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } }, client: true },
  });
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(quote));
});

export const PUT = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "quotes", "edit");
  if (denied) return denied;
  const body = await validateBody(req, updateQuoteSchema);
  if (isValidationError(body)) return body;
  const lines = body.lines || [];
  // Rounding follows the tenant's currency (millimes vs centimes).
  const settings = await prisma.companySettings.findFirst({
    where: { tenantId },
    select: { currency: true },
  });
  const totals = calculateDocumentTotals({
    lines,
    shippingCost: body.shipping_cost || 0,
    shippingTaxRate: body.shipping_tax_rate ?? 20,
    discountPercent: body.discount_percent || 0,
    discountAmount: body.discount_amount || 0,
    currency: settings?.currency,
  });

  // Tenant-scoped existence check BEFORE any write: without it the old code's
  // unscoped line deleteMany let any tenant wipe another tenant's quote lines
  // (audit SEC-3).
  const existing = await prisma.quote.findFirst({
    where: { tenantId, id: params?.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const quote = await prisma.quote.update({
    where: { tenantId, id: params?.id },
    data: {
      clientId: body.client_id,
      status: body.status,
      issueDate: new Date(body.issue_date),
      validityDate: new Date(body.validity_date),
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      notes: body.notes || null,
      notesHtml: body.notes_html || null,
      shippingCost: body.shipping_cost || 0,
      shippingTaxRate: body.shipping_tax_rate ?? 20,
      downPaymentPercent: body.down_payment_percent || 0,
      downPaymentAmount: body.down_payment_amount || 0,
      discountPercent: body.discount_percent || 0,
      discountAmount: body.discount_amount || 0,
      // Nested deleteMany + create in the SAME atomic update: a failure can no
      // longer leave the quote with its lines deleted (audit SALE-3).
      lines: {
        deleteMany: {},
        create: lines.map((line: LineInput, idx: number) => {
          const lt = calculateLineTotals(line);
          return {
            productId: line.product_id || null,
            description: line.description,
            descriptionHtml: line.description_html || null,
            quantity: line.quantity,
            unitPrice: line.unit_price,
            taxRate: line.tax_rate,
            subtotal: lt.subtotal,
            taxAmount: lt.taxAmount,
            total: lt.total,
            position: line.position ?? idx,
            groupName: line.group_name || null,
            discountPercent: line.discount_percent || 0,
            isSubtotalLine: line.is_subtotal_line || false,
          };
        }),
      },
    },
    include: { lines: { orderBy: { position: "asc" } }, client: true },
  });

  return NextResponse.json(toSnakeCase(quote));
});

export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "quotes", "delete");
  if (denied) return denied;
  await prisma.quote.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
