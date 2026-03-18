import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId }) => {
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, status: "ISSUED" },
    include: { client: true, payments: true },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();

  const result = invoices
    .map((inv) => {
      const totalPaid = inv.payments.reduce((sum, p) => sum + p.amount, 0);
      const remaining = inv.total - totalPaid;
      const dueDate = new Date(inv.dueDate);
      const daysOverdue = Math.max(
        0,
        Math.floor((now.getTime() - dueDate.getTime()) / 86400000)
      );
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.client.name,
        issueDate: inv.issueDate.toISOString(),
        dueDate: inv.dueDate.toISOString(),
        total: remaining,
        daysOverdue,
      };
    })
    .filter((item) => item.total > 0);

  return NextResponse.json(toSnakeCase(result));
});
