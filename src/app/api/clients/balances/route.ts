import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

// GET /api/clients/balances
//
// Lightweight per-client outstanding balance for the clients list, computed in
// aggregate (no N+1). balance = non-DRAFT invoices - payments - ISSUED credit notes.
// Payments have no clientId, so they are attributed via their invoice's clientId.
export const GET = withAuth(async (req, { tenantId }) => {
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
    prisma.payment.groupBy({
      by: ["invoiceId"],
      where: { tenantId },
      _sum: { amount: true },
    }),
  ]);

  const invoiceToClient = new Map(invoices.map((i) => [i.id, i.clientId]));
  const balances = new Map<string, number>();

  for (const r of invoiceSums) {
    // Outstanding = TTC total + stamp duty (droit de timbre) snapshot.
    balances.set(r.clientId, (balances.get(r.clientId) ?? 0) + (r._sum.total ?? 0) + (r._sum.stampDuty ?? 0));
  }
  for (const r of creditSums) {
    balances.set(r.clientId, (balances.get(r.clientId) ?? 0) - (r._sum.total ?? 0));
  }
  for (const r of paymentSums) {
    const clientId = invoiceToClient.get(r.invoiceId);
    if (clientId) {
      balances.set(clientId, (balances.get(clientId) ?? 0) - (r._sum.amount ?? 0));
    }
  }

  const result = Array.from(balances, ([client_id, balance]) => ({ client_id, balance }));
  return NextResponse.json(result);
});
