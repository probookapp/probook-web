import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";

// GET /api/clients/balances
//
// Lightweight per-client outstanding balance for the clients list, computed in
// aggregate (no N+1). balance = non-DRAFT invoices - payments - ISSUED credit notes.
// Payments have no clientId, so they are attributed via their invoice's clientId.
export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "clients", "view");
  if (denied) return denied;
  const [invoiceSums, creditSums, invoices, paymentSums] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["clientId"],
      where: { tenantId, status: { not: "DRAFT" } },
      _sum: { total: true, stampDuty: true },
    }),
    prisma.creditNote.groupBy({
      by: ["clientId"],
      where: { tenantId, status: "ISSUED" },
      _sum: { total: true },
    }),
    prisma.invoice.findMany({ where: { tenantId }, select: { id: true, clientId: true } }),
    // By invoice, and by quote for the deposits not invoiced yet.
    prisma.payment.groupBy({
      by: ["invoiceId", "quoteId"],
      where: { tenantId },
      _sum: { amount: true },
    }),
  ]);

  const invoiceToClient = new Map(invoices.map((i) => [i.id, i.clientId]));
  // A deposit on a quote not yet invoiced is a credit the client already holds.
  const depositQuoteIds = [
    ...new Set(paymentSums.filter((r) => !r.invoiceId && r.quoteId).map((r) => r.quoteId as string)),
  ];
  const quoteToClient = new Map(
    depositQuoteIds.length
      ? (
          await prisma.quote.findMany({
            where: { tenantId, id: { in: depositQuoteIds } },
            select: { id: true, clientId: true },
          })
        ).map((q) => [q.id, q.clientId])
      : []
  );
  const balances = new Map<string, number>();

  for (const r of invoiceSums) {
    // Outstanding = TTC total + stamp duty (droit de timbre) snapshot.
    balances.set(r.clientId, (balances.get(r.clientId) ?? 0) + num(r._sum.total) + num(r._sum.stampDuty));
  }
  for (const r of creditSums) {
    balances.set(r.clientId, (balances.get(r.clientId) ?? 0) - num(r._sum.total));
  }
  for (const r of paymentSums) {
    const clientId = r.invoiceId
      ? invoiceToClient.get(r.invoiceId)
      : r.quoteId
        ? quoteToClient.get(r.quoteId)
        : undefined;
    if (clientId) {
      balances.set(clientId, (balances.get(clientId) ?? 0) - num(r._sum.amount));
    }
  }

  const result = Array.from(balances, ([client_id, balance]) => ({ client_id, balance }));
  return NextResponse.json(result);
});
