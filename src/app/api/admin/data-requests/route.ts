import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin, withSuperAdmin, logAuditEvent, getClientIp } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { validateBody, isValidationError } from "@/lib/validate";
import { createDataRequestSchema } from "@/lib/validations";

export const GET = withPlatformAdmin(async (_req: NextRequest, _ctx) => {
  const dataRequests = await prisma.dataRequest.findMany({
    include: {
      tenant: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(toSnakeCase(dataRequests));
});

export const POST = withSuperAdmin(async (req: NextRequest, ctx) => {
  const body = await validateBody(req, createDataRequestSchema);
  if (isValidationError(body)) return body;
  const { tenant_id, request_type, notes } = body;

  let dataRequest = await prisma.dataRequest.create({
    data: {
      tenantId: tenant_id,
      requestType: request_type,
      requestedBy: ctx.adminId,
      notes: notes || null,
      status: "processing",
    },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "data_request.create",
    targetType: "data_request",
    targetId: dataRequest.id,
    tenantId: tenant_id,
    metadata: { requestType: request_type },
    ipAddress: getClientIp(req),
  });

  // For export type, process immediately
  if (request_type === "export") {
    try {
      // Gather all tenant data
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenant_id },
        include: {
          users: { select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true } },
          clients: true,
          products: true,
          quotes: { include: { lines: true } },
          invoices: { include: { lines: true, payments: true } },
          expenses: true,
          suppliers: true,
          companySettings: true,
          onboardingSteps: true,
        },
      });

      const exportData = JSON.stringify(tenant, null, 2);
      const dataUrl = `data:application/json;base64,${Buffer.from(exportData).toString("base64")}`;

      dataRequest = await prisma.dataRequest.update({
        where: { id: dataRequest.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          filePath: dataUrl,
        },
      });
    } catch (error) {
      console.error("Data export failed:", error);
      dataRequest = await prisma.dataRequest.update({
        where: { id: dataRequest.id },
        data: {
          status: "failed",
          notes: `${notes || ""}\nExport failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      });
    }
  }

  return NextResponse.json(toSnakeCase(dataRequest), { status: 201 });
});
