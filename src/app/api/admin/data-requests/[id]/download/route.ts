import { NextRequest, NextResponse } from "next/server";
import { withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";

export const GET = withSuperAdmin(async (req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const dataRequest = await prisma.dataRequest.findUnique({
    where: { id },
    select: { filePath: true, tenantId: true, status: true },
  });

  if (!dataRequest) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!dataRequest.filePath) {
    return NextResponse.json({ error: "No export file available" }, { status: 404 });
  }

  // Audit-log every export download — this hands out the full tenant dataset.
  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "data_request.download_export",
    targetType: "data_request",
    targetId: id,
    tenantId: dataRequest.tenantId,
    ipAddress: getClientIp(req),
  });

  // If it's a data URL, decode and return the content
  if (dataRequest.filePath.startsWith("data:")) {
    const base64Data = dataRequest.filePath.split(",")[1];
    const jsonBuffer = Buffer.from(base64Data, "base64");

    return new NextResponse(jsonBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="tenant-${dataRequest.tenantId}-export.json"`,
      },
    });
  }

  return NextResponse.json({ file_path: dataRequest.filePath });
});
