import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { verifyInvoiceIntegrityHash } from "@/lib/invoice-integrity";

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
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    shippingCost: invoice.shippingCost,
    stampDuty: invoice.stampDuty,
    isCashSale: invoice.isCashSale,
    stampDutyExempt: invoice.stampDutyExempt,
    lines: invoice.lines,
  });

  return NextResponse.json({
    valid,
    stored_hash: invoice.integrityHash,
    computed_hash: computedHash,
  });
});
