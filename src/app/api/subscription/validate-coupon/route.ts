import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/api-utils";
import { validateBody, isValidationError } from "@/lib/validate";
import { validateCouponSchema } from "@/lib/validations";
import { readRate } from "@/lib/alacarte-server";
import { couponDiscount, couponValueIn, resolvePlanPrice } from "@/lib/plan-pricing";

// Requires tenant auth: an unauthenticated endpoint here is a coupon
// enumeration oracle. Read-only — never increments coupon usage.
export const POST = withAuth(async (req: NextRequest, _ctx) => {
  const body = await validateBody(req, validateCouponSchema);
  if (isValidationError(body)) return body;
  const { code, plan_id, billing_cycle, currency } = body;

  const coupon = await prisma.coupon.findUnique({
    where: { code },
    include: {
      planRestrictions: true,
    },
  });

  if (!coupon) {
    return NextResponse.json({ valid: false, reason: "Coupon not found" });
  }

  if (!coupon.isActive) {
    return NextResponse.json({ valid: false, reason: "Coupon is not active" });
  }

  if (coupon.expiresAt && coupon.expiresAt <= new Date()) {
    return NextResponse.json({ valid: false, reason: "Coupon has expired" });
  }

  if (coupon.maxUses !== null && coupon.currentUses >= coupon.maxUses) {
    return NextResponse.json({ valid: false, reason: "Coupon has reached its maximum uses" });
  }

  // Check plan restrictions
  if (coupon.planRestrictions.length > 0) {
    const planAllowed = coupon.planRestrictions.some((r) => r.planId === plan_id);
    if (!planAllowed) {
      return NextResponse.json({ valid: false, reason: "Coupon is not valid for this plan" });
    }
  }

  const plan = await prisma.plan.findUnique({
    where: { id: plan_id },
    include: { prices: true },
  });

  if (!plan) {
    return NextResponse.json({ valid: false, reason: "Plan not found" });
  }

  // Priced exactly as the offers were listed and as the approval will bill:
  // the same resolution, the same currency, the same rounding.
  const rate = await readRate(currency);
  const price = resolvePlanPrice(plan, currency, rate);
  const basePrice = billing_cycle === "monthly" ? price.monthly : price.yearly;
  const discountAmount = couponDiscount(coupon, basePrice, price.currency, rate);
  const value = couponValueIn(coupon, price.currency, rate);

  if (discountAmount === null || value === null) {
    return NextResponse.json({
      valid: false,
      reason: `Coupon cannot be applied in ${price.currency}`,
    });
  }

  return NextResponse.json({
    valid: true,
    code: coupon.code,
    discount_type: coupon.discountType,
    // A percentage, or the fixed amount already expressed in `currency`.
    discount_value: value,
    currency: price.currency,
    discount_amount: discountAmount,
    // The offers the coupon applies to; null when it applies to all of them.
    eligible_plan_ids: coupon.planRestrictions.length
      ? coupon.planRestrictions.map((r) => r.planId)
      : null,
  });
});
