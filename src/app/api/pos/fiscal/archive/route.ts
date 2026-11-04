import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { ArchiveError, buildArchive } from "@/lib/pos-archive";

/**
 * Download the signed archive of a finished month (?period=2026-10) or year
 * (?period=2026). Generating it is itself recorded in the journal.
 */
export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "reports", "view");
  if (denied) return denied;
  const period = new URL(req.url).searchParams.get("period") ?? "";
  const user = await prisma.user.findFirst({
    where: { tenantId, id: session.userId },
    select: { displayName: true },
  });
  try {
    const archive = await buildArchive(tenantId, period, { id: session.userId, name: user?.displayName ?? null });
    return new NextResponse(JSON.stringify(archive, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="journal-caisse-${period}.json"`,
      },
    });
  } catch (err) {
    if (err instanceof ArchiveError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});
