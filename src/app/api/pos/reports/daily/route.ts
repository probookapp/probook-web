import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId }) => {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const registerId = searchParams.get("registerId");

  if (!date) {
    return NextResponse.json({ error: "date parameter is required" }, { status: 400 });
  }

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  const baseWhere = {
    tenantId,
    transactionDate: { gte: dayStart, lte: dayEnd },
    ...(registerId ? { registerId } : {}),
  };

  const transactions = await prisma.posTransaction.findMany({
    where: { ...baseWhere, status: "COMPLETED" },
    include: { payments: true, lines: true },
  });

  // Get register name if specific register requested
  let registerName: string | null = null;
  if (registerId) {
    const register = await prisma.posRegister.findUnique({
      where: { id: registerId },
      select: { name: true },
    });
    registerName = register?.name || null;
  }

  // Count distinct sessions
  const sessionIds = new Set(transactions.map((tx) => tx.sessionId));

  let totalSales = 0;
  let subtotal = 0;
  let taxAmount = 0;
  let cashSales = 0;
  let cardSales = 0;

  for (const tx of transactions) {
    totalSales += tx.finalAmount;
    subtotal += tx.subtotal;
    taxAmount += tx.taxAmount;
    for (const p of tx.payments) {
      if (p.paymentMethod === "CASH") cashSales += p.amount;
      else if (p.paymentMethod === "CARD") cardSales += p.amount;
    }
  }

  // Cancelled transactions
  const cancelledTxs = await prisma.posTransaction.findMany({
    where: { ...baseWhere, status: "CANCELLED" },
  });
  const cancelledCount = cancelledTxs.length;
  const cancelledTotal = cancelledTxs.reduce((sum, tx) => sum + tx.finalAmount, 0);

  return NextResponse.json(
    toSnakeCase({
      date,
      registerId: registerId || null,
      registerName,
      sessionCount: sessionIds.size,
      transactionCount: transactions.length,
      totalSales,
      subtotal,
      taxAmount,
      cashSales,
      cardSales,
      cancelledCount,
      cancelledTotal,
    })
  );
});
