import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import {
  withSuperAdmin,
  logAuditEvent,
  getClientIp,
} from "@/lib/admin-api-utils";

export const POST = withSuperAdmin(async (req, ctx) => {
  const id = ctx.params?.id;
  const body = await req.json().catch(() => ({})) as { payment_method?: string | null };

  const existing = await prisma.subscriptionInvoice.findUnique({
    where: { id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (existing.status === "paid") {
    return NextResponse.json(
      { error: "Invoice is already paid" },
      { status: 400 }
    );
  }

  const invoice = await prisma.subscriptionInvoice.update({
    where: { id },
    data: {
      status: "paid",
      paymentMethod: body.payment_method || null,
      paidAt: new Date(),
    },
    include: {
      subscription: {
        include: {
          plan: { select: { id: true, name: true, slug: true } },
          tenant: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "subscription_invoice.mark_paid",
    targetType: "subscription_invoice",
    targetId: id,
    tenantId: existing.tenantId,
    metadata: {
      invoiceNumber: existing.invoiceNumber,
      paymentMethod: body.payment_method,
    },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(invoice));
});
