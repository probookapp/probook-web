import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { validateBody, isValidationError } from "@/lib/validate";
import { updateInvoiceSchema } from "@/lib/validations";

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
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function calculateLineTotals(line: LineInput) {
  const subtotal = round2(line.quantity * line.unit_price);
  const taxAmount = round2(subtotal * (line.tax_rate / 100));
  const total = round2(subtotal + taxAmount);
  return { subtotal, taxAmount, total };
}

function calculateDocumentTotals(lines: LineInput[], shippingCost = 0, shippingTaxRate = 20) {
  let subtotal = 0;
  let taxAmount = 0;
  for (const line of lines) {
    if (!line.is_subtotal_line) {
      const lt = calculateLineTotals(line);
      subtotal += lt.subtotal;
      taxAmount += lt.taxAmount;
    }
  }
  subtotal = round2(subtotal + shippingCost);
  taxAmount = round2(taxAmount + round2(shippingCost * (shippingTaxRate / 100)));
  const total = round2(subtotal + taxAmount);
  return { subtotal, taxAmount, total };
}

export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;
  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, id: params?.id },
    include: {
      lines: { orderBy: { position: "asc" } },
      client: true,
      payments: true,
    },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(invoice));
});

export const PUT = withAuth(async (req, { session, tenantId, params }) => {
  const denied = await requirePermission(session, "invoices", "edit");
  if (denied) return denied;

  const body = await validateBody(req, updateInvoiceSchema);
  if (isValidationError(body)) return body;

  // Tenant-scoped existence check BEFORE any write: without it the old code's
  // unscoped line deleteMany let any tenant wipe another tenant's invoice lines
  // (audit SEC-3).
  const existing = await prisma.invoice.findFirst({
    where: { tenantId, id: params?.id },
    select: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Issued/paid invoices are immutable (audit SALE-14): editing them would
  // invalidate the integrity hash and the frozen COGS snapshots. Corrections go
  // through a credit note; status transitions go through issue/mark-paid.
  if (existing.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Only DRAFT invoices can be edited. Use a credit note to correct an issued invoice." },
      { status: 409 }
    );
  }

  const lines = body.lines || [];
  const totals = calculateDocumentTotals(lines, body.shipping_cost || 0, body.shipping_tax_rate ?? 20);

  // Only drafts reach this point and drafts never carry timbre — the snapshot
  // is recomputed at issue time. Any client-supplied status is ignored: the
  // invoice stays DRAFT (transitions happen via the issue/mark-paid endpoints).
  const invoice = await prisma.invoice.update({
    where: { tenantId, id: params?.id, status: "DRAFT" },
    data: {
      clientId: body.client_id,
      issueDate: new Date(body.issue_date),
      dueDate: new Date(body.due_date),
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      isCashSale: body.is_cash_sale ?? false,
      stampDutyExempt: body.stamp_duty_exempt ?? false,
      stampDuty: 0,
      notes: body.notes || null,
      notesHtml: body.notes_html || null,
      shippingCost: body.shipping_cost || 0,
      shippingTaxRate: body.shipping_tax_rate ?? 20,
      downPaymentPercent: body.down_payment_percent || 0,
      downPaymentAmount: body.down_payment_amount || 0,
      isDownPaymentInvoice: body.is_down_payment_invoice || false,
      parentQuoteId: body.parent_quote_id || null,
      // Nested deleteMany + create in the SAME atomic update: a failure can no
      // longer leave the invoice with its lines deleted (audit SALE-3).
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
            isSubtotalLine: line.is_subtotal_line || false,
          };
        }),
      },
    },
    include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
  });

  return NextResponse.json(toSnakeCase(invoice));
});

export const DELETE = withAuth(async (req, { session, tenantId, params }) => {
  const denied = await requirePermission(session, "invoices", "delete");
  if (denied) return denied;

  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, id: params?.id },
    select: { id: true, status: true, payments: { select: { id: true }, take: 1 } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Issued invoices are part of the legal numbering sequence and paid ones have
  // money attached — neither may simply vanish (audit SALE-10).
  if (invoice.status !== "DRAFT" || invoice.payments.length > 0) {
    return NextResponse.json(
      { error: "Only DRAFT invoices without payments can be deleted. Use a credit note to cancel an issued invoice." },
      { status: 409 }
    );
  }

  await prisma.invoice.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
