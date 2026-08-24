import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase, withAuth } from "@/lib/api-utils";
import { validateBody, isValidationError } from "@/lib/validate";
import { subscriptionRequestSchema } from "@/lib/validations";
import { checkSeatCeiling, checkSeatCount, seatCeilingError } from "@/lib/plan-downgrade";
import { priceComposition, createComposedPlan } from "@/lib/alacarte-server";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  // Only tenant admins can submit subscription requests
  if (ctx.session.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: only tenant admins can submit subscription requests" },
      { status: 403 }
    );
  }

  // Require a verified email before a subscription can be requested. This is
  // where account ownership is confirmed (the trial itself starts unverified).
  const requester = await prisma.user.findUnique({
    where: { id: ctx.session.userId },
    select: { emailVerified: true },
  });
  if (!requester?.emailVerified) {
    return NextResponse.json(
      {
        error: "Please verify your email address before subscribing.",
        code: "EMAIL_NOT_VERIFIED",
      },
      { status: 403 }
    );
  }

  const body = await validateBody(req, subscriptionRequestSchema);
  if (isValidationError(body)) return body;
  const { plan_id, billing_cycle, coupon_code, request_type, currency, custom } = body;

  // A composed offer covers exactly the seats it was composed for, so that
  // figure is the ceiling to check against; a listed offer carries its own.
  const composition = custom
    ? { moduleKeys: custom.feature_keys, seats: custom.seats }
    : null;

  // A change the team does not fit into is refused here, where the person
  // asking still has the context to act on it — not silently at approval time,
  // days later, in a panel they cannot see.
  const seatCheck = composition
    ? await checkSeatCount(ctx.tenantId, composition.seats)
    : await checkSeatCeiling(ctx.tenantId, plan_id!);
  if (seatCheck) {
    return NextResponse.json(seatCeilingError(seatCheck), { status: 409 });
  }

  // Check for existing pending request
  const existingPending = await prisma.subscriptionRequest.findFirst({
    where: {
      tenantId: ctx.tenantId,
      status: "pending",
    },
  });

  if (existingPending) {
    return NextResponse.json(
      {
        error: "A pending subscription request already exists for this tenant",
        code: "PENDING_REQUEST_EXISTS",
      },
      { status: 409 }
    );
  }

  let targetPlanId: string;

  if (composition) {
    // Priced from the catalogue, never from the figure the page sent: the total
    // arrives from a screen the customer can edit.
    const priced = await priceComposition(composition, currency);
    if ("error" in priced) {
      return NextResponse.json(priced, { status: 400 });
    }
    const plan = await createComposedPlan(
      ctx.tenantId,
      composition,
      priced.quote,
      priced.currency
    );
    targetPlanId = plan.id;
  } else {
    // Validate plan exists and is active
    const plan = await prisma.plan.findUnique({
      where: { id: plan_id! },
    });

    if (!plan || !plan.isActive) {
      return NextResponse.json(
        { error: "Plan not found or is not active" },
        { status: 400 }
      );
    }
    targetPlanId = plan.id;
  }

  const request = await prisma.subscriptionRequest.create({
    data: {
      tenantId: ctx.tenantId,
      requestType: request_type,
      targetPlanId,
      billingCycle: billing_cycle,
      currency: currency || "DZD",
      couponCode: coupon_code || null,
    },
  });

  return NextResponse.json(toSnakeCase(request), { status: 201 });
});
