import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { sweepTenantReminders } from "@/lib/reminder-sweep";

export const POST = withAuth(async (req, { tenantId, session }) => {
  // Automatic sweep triggered by the dashboard reminders widget: creates
  // reminders only from the tenant's own overdue/expiring documents. The
  // actual sweep logic lives in @/lib/reminder-sweep, shared with the daily
  // /api/cron/reminders job.
  const denied = await requirePermission(session, "dashboard", "view");
  if (denied) return denied;
  const created = await sweepTenantReminders(tenantId);
  return NextResponse.json(toSnakeCase(created));
});
