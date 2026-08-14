import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const sessionId = params?.sessionId;
  const posSession = await prisma.posSession.findFirst({
    where: { tenantId, id: sessionId },
    include: { register: true, user: true },
  });
  if (!posSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const transactions = await prisma.posTransaction.findMany({
    where: { tenantId, sessionId },
    include: { payments: true, lines: true },
  });

  const cashMovements = await prisma.posCashMovement.findMany({
    where: { tenantId, sessionId },
  });

  const completed = transactions.filter((t) => t.status === "COMPLETED");
  const cancelled = transactions.filter((t) => t.status === "CANCELLED");

  let totalSales = 0;
  let subtotal = 0;
  let taxAmount = 0;
  let totalCash = 0;
  let totalCard = 0;
  const byMethod = new Map<string, number>();
  for (const tx of completed) {
    totalSales += num(tx.finalAmount);
    subtotal += num(tx.subtotal);
    taxAmount += num(tx.taxAmount);
    for (const p of tx.payments) {
      // Every method gets its own line: cheques and transfers used to
      // vanish from the breakdown while still counting in total sales,
      // so the Z-report could not be reconciled by hand.
      const method = p.paymentMethod.toUpperCase();
      byMethod.set(method, (byMethod.get(method) ?? 0) + num(p.amount));
      if (method === "CASH") totalCash += num(p.amount);
      else if (method === "CARD") totalCard += num(p.amount);
    }
  }

  let cashIn = 0;
  let cashOut = 0;
  for (const mv of cashMovements) {
    if (mv.movementType === "IN") cashIn += num(mv.amount);
    else cashOut += num(mv.amount);
  }

  const netCashMovement = cashIn - cashOut;

  return NextResponse.json(
    toSnakeCase({
      session: posSession,
      registerName: posSession.register.name,
      userName: posSession.user.displayName || posSession.user.username,
      transactionCount: completed.length,
      cancelledCount: cancelled.length,
      totalSales,
      cashSales: totalCash,
      // Legacy cash/card fields are kept; salesByMethod is the complete picture.
      // A list, not a map keyed by method: toSnakeCase rewrites object keys,
      // and it would turn "CASH" into "_c_a_s_h".
      salesByMethod: Array.from(byMethod, ([method, amount]) => ({ method, amount })),
      cardSales: totalCard,
      subtotal,
      taxAmount,
      cancelledTotal: cancelled.reduce((sum, tx) => sum + num(tx.finalAmount), 0),
      cashMovements: cashMovements,
      netCashMovement,
      expectedCash: num(posSession.openingFloat) + totalCash + netCashMovement,
    })
  );
});
