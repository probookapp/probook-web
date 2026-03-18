import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { createHash } from "crypto";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!invoice.integrityHash) {
    return NextResponse.json({ valid: false, reason: "No integrity hash stored" });
  }

  const hashInput = [
    invoice.invoiceNumber,
    invoice.clientId,
    invoice.issueDate.toISOString(),
    invoice.subtotal.toString(),
    invoice.taxAmount.toString(),
    invoice.total.toString(),
    ...invoice.lines.map((l) =>
      `${l.description}|${l.quantity}|${l.unitPrice}|${l.taxRate}|${l.subtotal}`
    ),
  ].join("|");

  const computedHash = createHash("sha256").update(hashInput).digest("hex");
  const valid = computedHash === invoice.integrityHash;

  return NextResponse.json({
    valid,
    stored_hash: invoice.integrityHash,
    computed_hash: computedHash,
  });
});
