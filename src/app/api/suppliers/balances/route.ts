import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { getSupplierBalances } from "@/lib/supplier-account";

// GET /api/suppliers/balances
//
// Per-supplier balance for the suppliers list, in aggregate (no N+1).
// Positive = the business owes the supplier, negative = the supplier holds credit.
export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "suppliers", "view");
  if (denied) return denied;
  const balances = await getSupplierBalances(prisma, tenantId);
  const result = Array.from(balances, ([supplier_id, balance]) => ({ supplier_id, balance }));
  return NextResponse.json(result);
});
