import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, markOnboardingStep, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { calculateDocumentTotals, calculateLineTotals } from "@/lib/document-totals";
import { Prisma } from "@/generated/prisma/client";
import { requirePermission } from "@/lib/permissions-server";
import { parseArchivedFilter, parseStatusFilter, INVOICE_STATUSES } from "@/lib/document-status";
import { validateBody, isValidationError } from "@/lib/validate";
import { rejectInvalidLineVariants } from "@/lib/document-line-variants";
import { createInvoiceSchema } from "@/lib/validations";
import { computeStampDuty, DEFAULT_IS_CASH_SALE } from "@/lib/stamp-duty";
import { allocateDocumentNumber } from "@/lib/document-numbering";
import { num } from "@/lib/money";

interface LineInput {
  product_id?: string | null;
  variant_id?: string | null;
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


function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;

  // Filtering by state is a server-side where clause: filtering in the
  // browser would only ever filter the pages already loaded.
  const statusFilter = parseStatusFilter(
    new URL(req.url).searchParams.get("status"),
    INVOICE_STATUSES
  );
  // Archived documents are hidden from the working list by default; the
  // reports deliberately ignore this filter.
  const archivedFilter = parseArchivedFilter(new URL(req.url).searchParams.get("archived"));

  // Opt-in cursor pagination (audit SALE-23): lean rows for the list UI —
  // scalars + client name + payments aggregate, no line arrays.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.invoice.findFirst({
          where: { tenantId, id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const rows = await prisma.invoice.findMany({
      where: { tenantId, ...statusFilter, ...archivedFilter },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: {
        client: { select: { id: true, name: true } },
        payments: { select: { amount: true } },
      },
    });
    const data = rows.map(({ payments, ...rest }) => ({
      ...rest,
      paidTotal: payments.reduce((sum, p) => sum + num(p.amount), 0),
    }));
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

  const invoices = await prisma.invoice.findMany({
    where: { tenantId, ...statusFilter, ...archivedFilter },
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
  const badVariant = await rejectInvalidLineVariants(tenantId, body.lines ?? []);
  if (badVariant) return badVariant;

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
  const totals = calculateDocumentTotals({
    lines,
    shippingCost: body.shipping_cost || 0,
    shippingTaxRate: body.shipping_tax_rate ?? 20,
    discountPercent: body.discount_percent || 0,
    discountAmount: body.discount_amount || 0,
    // Rounding follows the tenant's currency (millimes vs centimes).
    currency: settings?.currency,
  });

  const status = body.status || "DRAFT";
  const isCashSale = body.is_cash_sale ?? DEFAULT_IS_CASH_SALE;
  const stampDutyExempt = body.stamp_duty_exempt ?? false;
  // Droit de timbre applies only to cash-settled, non-draft, non-exempt invoices
  // at/above the configured threshold. Others carry no timbre (so they can reach PAID).
  const stampDuty = computeStampDuty({
    fiscalProfile: settings?.fiscalProfile,
    enabled: settings?.stampDutyEnabled,
    rate: settings?.stampDutyRate,
    threshold: num(settings?.stampDutyThreshold),
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
            discountPercent: body.discount_percent || 0,
            discountAmount: body.discount_amount || 0,
            isDownPaymentInvoice: body.is_down_payment_invoice || false,
            parentQuoteId: body.parent_quote_id || null,
            lines: {
              create: lines.map((line: LineInput, idx: number) => {
                const lt = calculateLineTotals(line);
                return {
                  productId: line.product_id || null,
                  variantId: line.variant_id || null,
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
