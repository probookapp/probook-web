import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, markOnboardingStep } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/permissions-server";
import { validateBody, isValidationError } from "@/lib/validate";
import { createInvoiceSchema } from "@/lib/validations";
import { computeStampDuty } from "@/lib/stamp-duty";
import { allocateDocumentNumber } from "@/lib/document-numbering";

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

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;
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

export const POST = withAuth(async (req, { session, tenantId }) => {
  const denied = await requirePermission(session, "invoices", "create");
  if (denied) return denied;

  const body = await validateBody(req, createInvoiceSchema);
  if (isValidationError(body)) return body;

  const idempotencyKey = body.idempotency_key || null;

  // Replay of an already-created invoice (offline queue / lost-response retry)
  // → return it as-is instead of numbering a duplicate.
  if (idempotencyKey) {
    const existing = await prisma.invoice.findFirst({
      where: { tenantId, idempotencyKey },
      include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
    });
    if (existing) return NextResponse.json(toSnakeCase(existing));
  }

  // A stale offline cache can submit a deleted (or foreign) client id; without
  // this check it surfaces as an FK-violation 500 (Sentry: invoices_client_id_fkey).
  const client = await prisma.client.findFirst({
    where: { tenantId, id: body.client_id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const prefix = settings?.invoicePrefix ?? "INV-";
  const paymentTerms = settings?.defaultPaymentTerms ?? 30;

  const lines = body.lines || [];
  const totals = calculateDocumentTotals(lines, body.shipping_cost || 0, body.shipping_tax_rate ?? 20);

  const status = body.status || "DRAFT";
  const isCashSale = body.is_cash_sale ?? false;
  const stampDutyExempt = body.stamp_duty_exempt ?? false;
  // Droit de timbre applies only to cash-settled, non-draft, non-exempt invoices
  // at/above the configured threshold. Others carry no timbre (so they can reach PAID).
  const stampDuty = computeStampDuty({
    enabled: settings?.stampDutyEnabled,
    rate: settings?.stampDutyRate,
    threshold: settings?.stampDutyThreshold,
    isCashSale,
    exempt: stampDutyExempt,
    total: totals.total,
    isDraft: status === "DRAFT",
  });

  // Number allocation + create happen in ONE transaction so concurrent creates
  // get distinct numbers and a failed create rolls the counter back (SALE-1).
  // Retried on a unique violation (e.g. counter manually rewound in settings).
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; ; attempt++) {
    try {
      const invoice = await prisma.$transaction(async (tx) => {
        const nextNum = await allocateDocumentNumber(tx, tenantId, "nextInvoiceNumber");
        const invoiceNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

        return tx.invoice.create({
          data: {
            tenantId,
            invoiceNumber,
            idempotencyKey,
            clientId: body.client_id,
            quoteId: body.quote_id || null,
            status,
            issueDate: new Date(body.issue_date),
            dueDate: body.due_date ? new Date(body.due_date) : new Date(Date.now() + paymentTerms * 24 * 60 * 60 * 1000),
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
      });

      markOnboardingStep(tenantId, "first_invoice");
      return NextResponse.json(toSnakeCase(invoice));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // A concurrent request may have committed this exact invoice (same
      // idempotency key) between our pre-check and the create — return it.
      if (idempotencyKey) {
        const existing = await prisma.invoice.findFirst({
          where: { tenantId, idempotencyKey },
          include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
        });
        if (existing) return NextResponse.json(toSnakeCase(existing));
      }
      if (attempt >= MAX_ATTEMPTS - 1) throw err;
    }
  }
});
