import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, markOnboardingStep, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { calculateDocumentTotals, calculateLineTotals } from "@/lib/document-totals";
import { Prisma } from "@/generated/prisma/client";
import { validateBody, isValidationError } from "@/lib/validate";
import { rejectInvalidLineVariants } from "@/lib/document-line-variants";
import { createQuoteSchema } from "@/lib/validations";
import { requirePermission } from "@/lib/permissions-server";
import { parseArchivedFilter, parseStatusFilter, QUOTE_STATUSES } from "@/lib/document-status";
import { allocateDocumentNumber } from "@/lib/document-numbering";

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
  const denied = await requirePermission(session, "quotes", "view");
  if (denied) return denied;

  // Filtering by state is a server-side where clause: filtering in the
  // browser would only ever filter the pages already loaded.
  const statusFilter = parseStatusFilter(
    new URL(req.url).searchParams.get("status"),
    QUOTE_STATUSES
  );
  // Archived documents are hidden from the working list by default; the
  // reports deliberately ignore this filter.
  const archivedFilter = parseArchivedFilter(new URL(req.url).searchParams.get("archived"));

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
      where: { tenantId, ...statusFilter, ...archivedFilter },
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
    where: { tenantId, ...statusFilter, ...archivedFilter },
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
  const badVariant = await rejectInvalidLineVariants(tenantId, body.lines ?? []);
  if (badVariant) return badVariant;

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
  const totals = calculateDocumentTotals({
    lines,
    shippingCost: body.shipping_cost || 0,
    shippingTaxRate: body.shipping_tax_rate ?? 20,
    discountPercent: body.discount_percent || 0,
    discountAmount: body.discount_amount || 0,
    // Rounding follows the tenant's currency (millimes vs centimes).
    currency: settings?.currency,
  });

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
            discountPercent: body.discount_percent || 0,
            discountAmount: body.discount_amount || 0,
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
