import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { withPlatformAdmin, withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";

const ALLOWED_STATUSES = ["unpaid", "paid", "refunded"];

export const GET = withPlatformAdmin(async (_req, ctx) => {
  const id = ctx.params?.id;
  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id },
    include: {
      subscription: {
        include: {
          plan: { select: { id: true, name: true, slug: true } },
          tenant: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  return NextResponse.json(toSnakeCase(invoice));
});

// Edit an invoice (amount/currency/period/status) or refund it (status="refunded").
export const PUT = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  const body = (await req.json().catch(() => ({}))) as {
    amount?: number;
    currency?: string;
    status?: string;
    period_start?: string;
    period_end?: string;
  };

  if (body.status && !ALLOWED_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const existing = await prisma.subscriptionInvoice.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const nextStatus = body.status ?? existing.status;
  const updated = await prisma.subscriptionInvoice.update({
    where: { id },
    data: {
      amount: body.amount != null ? Math.round(body.amount) : existing.amount,
      currency: body.currency ?? existing.currency,
      status: nextStatus,
      // paidAt reflects paid state; refund/unpaid clears it.
      paidAt: nextStatus === "paid" ? existing.paidAt ?? new Date() : null,
      periodStart: body.period_start ? new Date(body.period_start) : existing.periodStart,
      periodEnd: body.period_end ? new Date(body.period_end) : existing.periodEnd,
    },
    include: {
      subscription: { include: { plan: true, tenant: { select: { id: true, name: true, slug: true } } } },
    },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: body.status === "refunded" ? "subscription_invoice.refund" : "subscription_invoice.update",
    targetType: "subscription_invoice",
    targetId: id,
    tenantId: existing.tenantId,
    metadata: { changes: body },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(updated));
});
