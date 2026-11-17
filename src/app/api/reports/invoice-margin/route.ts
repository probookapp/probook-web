import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";
import { invoiceMarginReport } from "@/lib/invoice-margin";

/** Margin, payments and balance of each invoice issued in the period, with the period's expenses. */
export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "reports", "view");
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const range: { gte: Date; lt: Date } =
    startDate && endDate
      ? {
          gte: new Date(startDate),
          lt: new Date(new Date(endDate).getTime() + 86400000), // include end date
        }
      : (() => {
          const year = new Date().getFullYear();
          return { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) };
        })();

  const [invoices, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId, status: { in: ["PAID", "ISSUED"] }, issueDate: range },
      select: {
        id: true,
        invoiceNumber: true,
        clientId: true,
        issueDate: true,
        status: true,
        subtotal: true,
        total: true,
        stampDuty: true,
        client: { select: { name: true } },
        lines: {
          select: {
            productId: true,
            quantity: true,
            costPriceSnapshot: true,
            isSubtotalLine: true,
            isBundleHeader: true,
          },
        },
        payments: { select: { amount: true } },
        creditNotes: {
          where: { status: "ISSUED" },
          select: {
            subtotal: true,
            restocked: true,
            lines: { select: { productId: true, quantity: true } },
          },
        },
      },
    }),
    prisma.expense.findMany({ where: { tenantId, date: range }, select: { amount: true } }),
  ]);

  const report = invoiceMarginReport(
    invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      clientId: inv.clientId,
      clientName: inv.client.name,
      issueDate: inv.issueDate.toISOString().slice(0, 10),
      status: inv.status,
      subtotal: num(inv.subtotal),
      total: num(inv.total),
      stampDuty: num(inv.stampDuty),
      lines: inv.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        costPriceSnapshot: num(l.costPriceSnapshot),
        isSubtotalLine: l.isSubtotalLine,
        isBundleHeader: l.isBundleHeader,
      })),
      payments: inv.payments.map((p) => ({ amount: num(p.amount) })),
      creditNotes: inv.creditNotes.map((c) => ({
        subtotal: num(c.subtotal),
        restocked: c.restocked,
        lines: c.lines,
      })),
    })),
    expenses.map((e) => ({ amount: num(e.amount) }))
  );

  return NextResponse.json(toSnakeCase(report));
});
