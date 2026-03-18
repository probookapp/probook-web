import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { updatePaymentSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const payment = await prisma.payment.findFirst({
    where: { tenantId, id: params?.id },
    include: { invoice: true },
  });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toSnakeCase(payment));
});

export const PUT = withAuth(async (req, { tenantId, params }) => {
  const body = await validateBody(req, updatePaymentSchema);
  if (isValidationError(body)) return body;
  const payment = await prisma.payment.update({
    where: { tenantId, id: params?.id },
    data: {
      amount: body.amount,
      paymentDate: new Date(body.payment_date),
      paymentMethod: body.payment_method,
      reference: body.reference || null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(toSnakeCase(payment));
});

export const DELETE = withAuth(async (req, { tenantId, params }) => {
  await prisma.payment.delete({ where: { tenantId, id: params?.id } });
  return new NextResponse(null, { status: 204 });
});
