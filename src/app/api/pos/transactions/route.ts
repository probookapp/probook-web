import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { posTransactionSchema } from "@/lib/validations";

interface PosLineInput {
  product_id?: string | null;
  barcode?: string | null;
  designation: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  discount_percent?: number;
  position?: number;
}

interface PosPaymentInput {
  payment_method: string;
  amount: number;
  cash_given?: number | null;
  change_given?: number | null;
  card_reference?: string | null;
}

export const POST = withAuth(async (req, { tenantId, session: authSession }) => {
  const body = await validateBody(req, posTransactionSchema);
  if (isValidationError(body)) return body;

  // Generate ticket number
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await prisma.posTransaction.count({
    where: {
      tenantId,
      transactionDate: {
        gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    },
  });
  const ticketNumber = `POS-${today}-${String(count + 1).padStart(4, "0")}`;

  // Calculate totals from lines
  const lines = body.lines || [];
  let subtotal = 0;
  let taxAmount = 0;
  for (const line of lines) {
    const lineTotal = line.quantity * line.unit_price;
    const discount = lineTotal * (line.discount_percent || 0) / 100;
    const ht = lineTotal - discount;
    const vat = ht * (line.tax_rate || 0) / 100;
    subtotal += ht;
    taxAmount += vat;
  }
  const total = subtotal + taxAmount;

  const discountPercent = body.discount_percent || 0;
  const discountAmount = body.discount_amount || (total * discountPercent / 100);
  const finalAmount = total - discountAmount;

  const transaction = await prisma.posTransaction.create({
    data: {
      tenantId,
      ticketNumber,
      registerId: body.register_id,
      sessionId: body.session_id,
      clientId: body.client_id || null,
      userId: authSession.userId,
      subtotal,
      taxAmount,
      total,
      discountPercent,
      discountAmount,
      finalAmount,
      status: "COMPLETED",
      notes: body.notes || null,
      lines: {
        create: lines.map((l: PosLineInput, i: number) => {
          const lineHt = l.quantity * l.unit_price * (1 - (l.discount_percent || 0) / 100);
          const lineVat = lineHt * (l.tax_rate || 0) / 100;
          return {
            productId: l.product_id || null,
            barcode: l.barcode || null,
            designation: l.designation,
            quantity: l.quantity,
            unitPrice: l.unit_price,
            taxRate: l.tax_rate || 0,
            subtotal: lineHt,
            taxAmount: lineVat,
            total: lineHt + lineVat,
            discountPercent: l.discount_percent || 0,
            position: i,
          };
        }),
      },
      payments: {
        create: (body.payments || []).map((p: PosPaymentInput) => ({
          paymentMethod: p.payment_method,
          amount: p.amount,
          cashGiven: p.cash_given || null,
          changeGiven: p.change_given || null,
          cardReference: p.card_reference || null,
        })),
      },
    },
    include: { lines: true, payments: true },
  });

  // Update stock for product lines
  for (const line of lines) {
    if (line.product_id) {
      await prisma.product.update({
        where: { tenantId, id: line.product_id },
        data: { quantity: { decrement: line.quantity } },
      });
    }
  }

  return NextResponse.json(toSnakeCase(transaction));
});
