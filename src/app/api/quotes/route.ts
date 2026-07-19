import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, markOnboardingStep, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { validateBody, isValidationError } from "@/lib/validate";
import { createQuoteSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
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
  const denied = await requirePermission(session, "quotes", "view");
  if (denied) return denied;

  // Opt-in cursor pagination (audit SALE-23): lean rows — scalars + client
  // name, no line arrays.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.quote.findFirst({
          where: { tenantId, id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const data = await prisma.quote.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: { client: { select: { id: true, name: true } } },
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

  const quotes = await prisma.quote.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { lines: { orderBy: { position: "asc" } }, client: true },
  });
  return NextResponse.json(toSnakeCase(quotes));
});

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "quotes", "create");
  if (denied) return denied;
  const body = await validateBody(req, createQuoteSchema);
  if (isValidationError(body)) return body;

  // Stale offline caches can submit a deleted/foreign client id; catch it here
  // instead of letting the FK violation surface as a 500.
  const client = await prisma.client.findFirst({
    where: { tenantId, id: body.client_id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const prefix = settings?.quotePrefix ?? "QT-";

  const lines = body.lines || [];
  const totals = calculateDocumentTotals(lines, body.shipping_cost || 0, body.shipping_tax_rate ?? 20);

  // Atomic number allocation + create (audit SALE-1); retried on a unique
  // violation (e.g. counter manually rewound in settings).
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; ; attempt++) {
    try {
      const quote = await prisma.$transaction(async (tx) => {
        const nextNum = await allocateDocumentNumber(tx, tenantId, "nextQuoteNumber");
        const quoteNumber = `${prefix}${String(nextNum).padStart(5, "0")}`;

        return tx.quote.create({
          data: {
            tenantId,
            quoteNumber,
            clientId: body.client_id,
            status: body.status || "DRAFT",
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
          include: { lines: { orderBy: { position: "asc" } }, client: true },
        });
      });

      markOnboardingStep(tenantId, "first_quote");
      return NextResponse.json(toSnakeCase(quote));
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= MAX_ATTEMPTS - 1) throw err;
    }
  }
});
