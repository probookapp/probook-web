import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase, withAuth } from "@/lib/api-utils";
import { validateBody, isValidationError } from "@/lib/validate";
import { subscriptionRequestSchema } from "@/lib/validations";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  // Only tenant admins can submit subscription requests
  if (ctx.session.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: only tenant admins can submit subscription requests" },
      { status: 403 }
    );
  }

  const body = await validateBody(req, subscriptionRequestSchema);
  if (isValidationError(body)) return body;
  const { plan_id, billing_cycle, coupon_code, request_type, currency } = body;

  // Check for existing pending request
  const existingPending = await prisma.subscriptionRequest.findFirst({
    where: {
      tenantId: ctx.tenantId,
      status: "pending",
    },
  });

  if (existingPending) {
    return NextResponse.json(
      { error: "A pending subscription request already exists for this tenant" },
      { status: 409 }
    );
  }

  // Validate plan exists and is active
  const plan = await prisma.plan.findUnique({
    where: { id: plan_id },
  });

  if (!plan || !plan.isActive) {
    return NextResponse.json(
      { error: "Plan not found or is not active" },
      { status: 400 }
    );
  }

  const request = await prisma.subscriptionRequest.create({
    data: {
      tenantId: ctx.tenantId,
      requestType: request_type,
      targetPlanId: plan_id,
      billingCycle: billing_cycle,
      currency: currency || "DZD",
      couponCode: coupon_code || null,
    },
  });

  return NextResponse.json(toSnakeCase(request), { status: 201 });
});
