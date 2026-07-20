import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { verifyInvoiceIntegrityHash } from "@/lib/invoice-integrity";
import { num } from "@/lib/money";

export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;

  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!invoice.integrityHash) {
    return NextResponse.json({ valid: false, reason: "No integrity hash stored" });
  }

  // "v2:"-prefixed hashes verify with the keyed HMAC scheme; bare hashes fall
  // back to the legacy unkeyed sha256 so pre-migration invoices still verify.
  const { valid, computedHash } = verifyInvoiceIntegrityHash(invoice.integrityHash, {
    invoiceNumber: invoice.invoiceNumber,
    clientId: invoice.clientId,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    subtotal: num(invoice.subtotal),
    taxAmount: num(invoice.taxAmount),
    total: num(invoice.total),
    shippingCost: num(invoice.shippingCost),
    stampDuty: num(invoice.stampDuty),
    isCashSale: invoice.isCashSale,
    stampDutyExempt: invoice.stampDutyExempt,
    // The hash serializes each money field via Number.toString(); map Decimals
    // to numbers here so stored v2 hashes still verify post-migration.
    lines: invoice.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: num(l.unitPrice),
      taxRate: l.taxRate,
      subtotal: num(l.subtotal),
      total: num(l.total),
    })),
  });

  return NextResponse.json({
    valid,
    stored_hash: invoice.integrityHash,
    computed_hash: computedHash,
  });
});
