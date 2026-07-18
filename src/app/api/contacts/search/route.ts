import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { userCan, forbidden } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, session }) => {
  // Contacts are readable from both the Clients and Phonebook modules.
  const canView =
    (await userCan(session, "clients", "view")) ||
    (await userCan(session, "phonebook", "view"));
  if (!canView) return forbidden();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("query") || searchParams.get("q") || "";

  const contacts = await prisma.clientContact.findMany({
    where: {
      tenantId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ],
    },
    include: { client: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(contacts));
});
