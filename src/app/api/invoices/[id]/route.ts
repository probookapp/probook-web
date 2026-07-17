import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { validateBody, isValidationError } from "@/lib/validate";
import { updateInvoiceSchema } from "@/lib/validations";
import { computeStampDuty } from "@/lib/stamp-duty";

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

function calculateLineTotals(line: LineInput) {
  const subtotal = line.quantity * line.unit_price;
  const taxAmount = subtotal * (line.tax_rate / 100);
  const total = subtotal + taxAmount;
  return { subtotal, taxAmount, total };
}

function calculateDocumentTotals(lines: LineInput[], shippingCost = 0, shippingTaxRate = 20) {
  let subtotal = 0;
  let taxAmount = 0;
  for (const line of lines) {
    if (!line.is_subtotal_line) {
      subtotal += line.quantity * line.unit_price;
      taxAmount += line.quantity * line.unit_price * (line.tax_rate / 100);
    }
  }
  subtotal += shippingCost;
  taxAmount += shippingCost * (shippingTaxRate / 100);
  const total = subtotal + taxAmount;
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
  const lines = body.lines || [];
  const totals = calculateDocumentTotals(lines, body.shipping_cost || 0, body.shipping_tax_rate ?? 20);

  // Recompute the timbre snapshot: only for cash-settled, non-DRAFT invoices at/
  // above the configured threshold. Drafts and non-cash invoices carry none.
  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const isCashSale = body.is_cash_sale ?? false;
  const stampDutyExempt = body.stamp_duty_exempt ?? false;
  const stampDuty = computeStampDuty({
    enabled: settings?.stampDutyEnabled,
    rate: settings?.stampDutyRate,
    threshold: settings?.stampDutyThreshold,
    isCashSale,
    exempt: stampDutyExempt,
    total: totals.total,
    isDraft: body.status === "DRAFT",
  });

  await prisma.invoiceLine.deleteMany({ where: { invoiceId: params?.id } });

  const invoice = await prisma.invoice.update({
    where: { tenantId, id: params?.id },
    data: {
      clientId: body.client_id,
      status: body.status,
      issueDate: new Date(body.issue_date),
      dueDate: new Date(body.due_date),
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      isCashSale,
      stampDutyExempt,
      stampDuty,
      notes: body.notes || null,
      notesHtml: body.notes_html || null,
      shippingCost: body.shipping_cost || 0,
      shippingTaxRate: body.shipping_tax_rate ?? 20,
      downPaymentPercent: body.down_payment_percent || 0,
      downPaymentAmount: body.down_payment_amount || 0,
      isDownPaymentInvoice: body.is_down_payment_invoice || false,
      parentQuoteId: body.parent_quote_id || null,
      lines: {
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

  await prisma.invoice.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
