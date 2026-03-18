import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (req, { tenantId, params }) => {
  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, id: params?.id },
    include: { payments: true },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { payment_method?: string; reference?: string; notes?: string };

  // Create a payment for the remaining amount
  const paidSoFar = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = invoice.total - paidSoFar;

  if (remaining > 0) {
    await prisma.payment.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        amount: remaining,
        paymentDate: new Date(),
        paymentMethod: body.payment_method || "other",
        reference: body.reference || null,
        notes: body.notes || null,
      },
    });
  }

  const updated = await prisma.invoice.update({
    where: { tenantId, id: params?.id },
    data: { status: "PAID" },
    include: { lines: { orderBy: { position: "asc" } }, client: true, payments: true },
  });

  return NextResponse.json(toSnakeCase(updated));
});
