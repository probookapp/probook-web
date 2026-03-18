import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, markOnboardingStep } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { createInvoiceSchema } from "@/lib/validations";

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

export const GET = withAuth(async (req, { tenantId }) => {
  const invoices = await prisma.invoice.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      lines: { orderBy: { position: "asc" } },
      client: true,
      payments: true,
    },
  });
  return NextResponse.json(toSnakeCase(invoices));
});

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, createInvoiceSchema);
  if (isValidationError(body)) return body;

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const nextNum = settings?.nextInvoiceNumber ?? 1;
  const prefix = settings?.invoicePrefix ?? "INV-";
  const invoiceNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;
  const paymentTerms = settings?.defaultPaymentTerms ?? 30;

  const lines = body.lines || [];
  const totals = calculateDocumentTotals(lines, body.shipping_cost || 0, body.shipping_tax_rate ?? 20);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      invoiceNumber,
      clientId: body.client_id,
      quoteId: body.quote_id || null,
      status: body.status || "DRAFT",
      issueDate: new Date(body.issue_date),
      dueDate: body.due_date ? new Date(body.due_date) : new Date(Date.now() + paymentTerms * 24 * 60 * 60 * 1000),
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
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

  if (settings) {
    await prisma.companySettings.update({
      where: { id: settings.id },
      data: { nextInvoiceNumber: nextNum + 1 },
    });
  }

  markOnboardingStep(tenantId, "first_invoice");
  return NextResponse.json(toSnakeCase(invoice));
});
