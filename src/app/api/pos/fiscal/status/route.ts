import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { journalStatus } from "@/lib/pos-archive";

/**
 * The secured cash journal at a glance: whether the chain holds, how many
 * entries it has, and the latest daily, monthly and yearly closures (closing
 * any finished period first). See src/lib/pos-journal.ts.
 */
export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "reports", "view");
  if (denied) return denied;
  const status = await journalStatus(tenantId);
  return NextResponse.json({
    software: status.software,
    chain_ok: status.chain.ok,
    chain_broken_at: status.chain.ok ? null : status.chain.brokenAt,
    entry_count: status.entryCount,
    first_entry_at: status.firstEntryAt,
    closures: status.closures,
  });
});
