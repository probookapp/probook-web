import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId }) => {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const dateFilter: { createdAt?: { gte: Date; lt: Date } } = {};
  if (startDate && endDate) {
    dateFilter.createdAt = {
      gte: new Date(startDate),
      lt: new Date(new Date(endDate).getTime() + 86400000),
    };
  }

  const quotes = await prisma.quote.findMany({
    where: { tenantId, ...dateFilter },
  });

  const totalQuotes = quotes.length;
  const acceptedQuotes = quotes.filter((q) => q.status === "ACCEPTED");
  const convertedQuotes = acceptedQuotes.length;
  const conversionRate =
    totalQuotes > 0
      ? Math.round((convertedQuotes / totalQuotes) * 10000) / 100
      : 0;

  const totalQuotedAmount = quotes.reduce((sum, q) => sum + q.total, 0);
  const convertedAmount = acceptedQuotes.reduce((sum, q) => sum + q.total, 0);

  return NextResponse.json(
    toSnakeCase({
      totalQuotes,
      convertedQuotes,
      conversionRate,
      totalQuotedAmount,
      convertedAmount,
    })
  );
});
