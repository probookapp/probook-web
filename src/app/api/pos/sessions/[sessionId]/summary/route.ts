import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

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
  for (const tx of completed) {
    totalSales += tx.finalAmount;
    subtotal += tx.subtotal;
    taxAmount += tx.taxAmount;
    for (const p of tx.payments) {
      if (p.paymentMethod === "CASH") totalCash += p.amount;
      else if (p.paymentMethod === "CARD") totalCard += p.amount;
    }
  }

  let cashIn = 0;
  let cashOut = 0;
  for (const mv of cashMovements) {
    if (mv.movementType === "IN") cashIn += mv.amount;
    else cashOut += mv.amount;
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
      cardSales: totalCard,
      subtotal,
      taxAmount,
      cancelledTotal: cancelled.reduce((sum, tx) => sum + tx.finalAmount, 0),
      cashMovements: cashMovements,
      netCashMovement,
      expectedCash: posSession.openingFloat + totalCash + netCashMovement,
    })
  );
});
