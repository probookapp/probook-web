import { NextResponse } from "next/server";
import { getAdminSession, getImpersonationData } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  // Only report impersonation to the super_admin actually doing it: require a
  // valid admin session that matches the signed impersonation cookie.
  const data = await getImpersonationData();
  const adminSession = data ? await getAdminSession() : null;

  if (
    !data ||
    !adminSession ||
    adminSession.role !== "super_admin" ||
    adminSession.userId !== data.adminId
  ) {
    return NextResponse.json({ impersonating: false });
  }

  // Fetch tenant name for display
  const tenant = await prisma.tenant.findUnique({
    where: { id: data.tenantId },
    select: { name: true },
  });

  return NextResponse.json({
    impersonating: true,
    tenant_id: data.tenantId,
    admin_id: data.adminId,
    tenant_name: tenant?.name || "Unknown",
  });
}
