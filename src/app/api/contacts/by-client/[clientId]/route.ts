import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { userCan, forbidden } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, params, session }) => {
  // Contacts are readable from both the Clients and Phonebook modules.
  const canView =
    (await userCan(session, "clients", "view")) ||
    (await userCan(session, "phonebook", "view"));
  if (!canView) return forbidden();
  const contacts = await prisma.clientContact.findMany({
    where: { tenantId, clientId: params?.clientId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(toSnakeCase(contacts));
});
