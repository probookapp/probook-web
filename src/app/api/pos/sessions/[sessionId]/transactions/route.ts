import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, parseListPagination, nextCursorOf } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const where = { tenantId, sessionId: params?.sessionId };

  // Opt-in cursor pagination (audit POS-18). The history drawer renders each
  // ticket's lines and payments (receipt reprint), so those small per-ticket
  // arrays stay included — pagination bounds how many tickets ship per request.
  const page = parseListPagination(req);
  if (page) {
    const cursorId = page.cursor
      ? (await prisma.posTransaction.findFirst({
          where: { tenantId, id: page.cursor },
          select: { id: true },
        }))?.id ?? null
      : null;
    const data = await prisma.posTransaction.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: {
        lines: true,
        payments: true,
        client: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(
      toSnakeCase({ data, nextCursor: nextCursorOf(data, page.limit) })
    );
  }

  const transactions = await prisma.posTransaction.findMany({
    where,
    include: { lines: true, payments: true, client: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(transactions));
});
