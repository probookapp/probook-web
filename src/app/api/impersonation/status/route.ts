import { NextResponse } from "next/server";
import { getImpersonationData } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const data = await getImpersonationData();

  if (!data) {
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
