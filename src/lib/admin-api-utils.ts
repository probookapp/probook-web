import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, PlatformSessionPayload } from "./auth";
import { prisma } from "./db";

export interface AdminContext {
  session: PlatformSessionPayload;
  adminId: string;
  role: string;
  params?: Record<string, string>;
}

export function withPlatformAdmin(
  handler: (req: NextRequest, ctx: AdminContext) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: { params?: Promise<Record<string, string>> }) => {
    try {
      const session = await getAdminSession();
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Verify admin still exists and is active
      const admin = await prisma.platformAdmin.findUnique({
        where: { id: session.userId },
      });
      if (!admin || !admin.isActive) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const params = context?.params ? await context.params : undefined;
      return await handler(req, {
        session,
        adminId: session.userId,
        role: session.role,
        params,
      });
    } catch (error: unknown) {
      console.error("Admin API Error:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      if (message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (message.includes("Forbidden")) {
        return NextResponse.json({ error: message }, { status: 403 });
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

export function withSuperAdmin(
  handler: (req: NextRequest, ctx: AdminContext) => Promise<NextResponse>
) {
  return withPlatformAdmin(async (req, ctx) => {
    if (ctx.role !== "super_admin") {
      return NextResponse.json(
        { error: "Forbidden: super admin access required" },
        { status: 403 }
      );
    }
    return handler(req, ctx);
  });
}

export async function logAuditEvent(params: {
  actorType: "platform_admin" | "user";
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        tenantId: params.tenantId,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        ipAddress: params.ipAddress,
      },
    });
  } catch (error) {
    // Never let audit logging failures break the main flow
    console.error("Failed to log audit event:", error);
  }
}

export function getClientIp(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined
  );
}
