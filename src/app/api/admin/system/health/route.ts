import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withPlatformAdmin } from "@/lib/admin-api-utils";

export const GET = withPlatformAdmin(async () => {
  let dbConnected = false;

  try {
    // Simple query to test DB connection
    await prisma.tenant.count();
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalTenants, totalUsers, totalInvoices, totalProducts, recentErrors] =
    await Promise.all([
      prisma.tenant.count().catch(() => 0),
      prisma.user.count().catch(() => 0),
      prisma.subscriptionInvoice.count().catch(() => 0),
      prisma.product.count().catch(() => 0),
      prisma.auditLog
        .count({
          where: {
            action: { contains: "error" },
            createdAt: { gte: twentyFourHoursAgo },
          },
        })
        .catch(() => 0),
    ]);

  return NextResponse.json({
    db_connected: dbConnected,
    total_tenants: totalTenants,
    total_users: totalUsers,
    total_invoices: totalInvoices,
    total_products: totalProducts,
    recent_errors: recentErrors,
    uptime: process.uptime(),
  });
});
