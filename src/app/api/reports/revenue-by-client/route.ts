import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId }) => {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const dateFilter: { issueDate?: { gte: Date; lt: Date } } = {};
  if (startDate && endDate) {
    dateFilter.issueDate = {
      gte: new Date(startDate),
      lt: new Date(new Date(endDate).getTime() + 86400000),
    };
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: ["PAID", "ISSUED"] },
      ...dateFilter,
    },
    include: { client: true },
  });

  const byClient: Record<string, {
    clientId: string;
    clientName: string;
    revenueBeforeTax: number;
    revenueTotal: number;
    invoiceCount: number;
  }> = {};

  for (const inv of invoices) {
    if (!byClient[inv.clientId]) {
      byClient[inv.clientId] = {
        clientId: inv.clientId,
        clientName: inv.client.name,
        revenueBeforeTax: 0,
        revenueTotal: 0,
        invoiceCount: 0,
      };
    }
    byClient[inv.clientId].revenueBeforeTax += inv.subtotal;
    byClient[inv.clientId].revenueTotal += inv.total;
    byClient[inv.clientId].invoiceCount += 1;
  }

  const result = Object.values(byClient).sort((a, b) => b.revenueTotal - a.revenueTotal);
  return NextResponse.json(toSnakeCase(result));
});
