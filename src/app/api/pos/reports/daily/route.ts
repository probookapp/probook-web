import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { num } from "@/lib/money";

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

  // Get register name if specific register requested (tenant-scoped — a foreign
  // register id must not leak another tenant's register name)
  let registerName: string | null = null;
  if (registerId) {
    const register = await prisma.posRegister.findFirst({
      where: { tenantId, id: registerId },
      select: { name: true },
    });
    if (!register) {
      return NextResponse.json({ error: "Register not found" }, { status: 404 });
    }
    registerName = register.name;
  }

  // Count distinct sessions
  const sessionIds = new Set(transactions.map((tx) => tx.sessionId));

  let totalSales = 0;
  let subtotal = 0;
  let taxAmount = 0;
  let cashSales = 0;
  let cardSales = 0;

  for (const tx of transactions) {
    totalSales += num(tx.finalAmount);
    subtotal += num(tx.subtotal);
    taxAmount += num(tx.taxAmount);
    for (const p of tx.payments) {
      if (p.paymentMethod === "CASH") cashSales += num(p.amount);
      else if (p.paymentMethod === "CARD") cardSales += num(p.amount);
    }
  }

  // Cancelled transactions
  const cancelledTxs = await prisma.posTransaction.findMany({
    where: { ...baseWhere, status: "CANCELLED" },
  });
  const cancelledCount = cancelledTxs.length;
  const cancelledTotal = cancelledTxs.reduce((sum, tx) => sum + num(tx.finalAmount), 0);

  // The day's cash OUT movements (refunds, drops, cancellations, purchases paid
  // from the till) reduce the drawer, so net them off the cash figure to make
  // it tie to what's actually in the drawer.
  const outMovements = await prisma.posCashMovement.aggregate({
    where: {
      tenantId,
      movementType: "OUT",
      createdAt: { gte: dayStart, lte: dayEnd },
      ...(registerId ? { session: { registerId } } : {}),
    },
    _sum: { amount: true },
  });
  const cashOutTotal = num(outMovements._sum.amount);

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
      // Gross cash collected on sales; cashOutTotal is the day's cash paid back
      // out; netCashSales = cashSales - cashOutTotal ties to the drawer.
      cashSales,
      cashOutTotal,
      netCashSales: cashSales - cashOutTotal,
      cardSales,
      cancelledCount,
      cancelledTotal,
    })
  );
});
