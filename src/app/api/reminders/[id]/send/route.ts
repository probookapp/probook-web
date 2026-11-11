import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { isResendConfigured } from "@/lib/email";
import { requirePermission } from "@/lib/permissions-server";
import { reminderDocumentModule } from "../../reminders-shared";
import { buildReminderMail, deliverReminder } from "@/lib/reminder-send";

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const reminder = await prisma.reminder.findFirst({
    where: { tenantId, id: params?.id },
  });

  if (!reminder) {
    return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  }

  // Sending emails a client about a document requires edit rights on that
  // document's module.
  const denied = await requirePermission(
    session,
    reminderDocumentModule(reminder.documentType) || "dashboard",
    "edit"
  );
  if (denied) return denied;

  if (reminder.sentAt) {
    return NextResponse.json({ error: "Reminder already sent" }, { status: 400 });
  }

  const mail = await buildReminderMail(reminder);
  if (!mail.ok) {
    return NextResponse.json({ error: mail.error }, { status: mail.status });
  }

  // If the mail provider is configured, send through it. Otherwise return
  // mailto: data for the browser to open the user's own email client.
  if (isResendConfigured()) {
    const updated = await deliverReminder(reminder, mail);
    return NextResponse.json(toSnakeCase(updated));
  }
  return NextResponse.json({
    mode: "mailto",
    to: mail.to,
    subject: mail.text.subject,
    body: mail.text.body,
  });
});
