import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { createHash } from "crypto";

export const POST = withAuth(async (req, { tenantId, params }) => {
  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, id: params?.id },
    include: { lines: { orderBy: { position: "asc" } }, client: true },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (invoice.status !== "DRAFT") {
    return NextResponse.json({ error: "Only DRAFT invoices can be issued" }, { status: 400 });
  }

  // Compute integrity hash from key fields
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

  const integrityHash = createHash("sha256").update(hashInput).digest("hex");

  const updated = await prisma.invoice.update({
    where: { tenantId, id: params?.id },
    data: {
      status: "ISSUED",
      integrityHash,
    },
    include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
  });

  return NextResponse.json(toSnakeCase(updated));
});
