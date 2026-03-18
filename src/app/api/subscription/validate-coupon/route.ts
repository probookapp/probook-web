import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { validateCouponSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  const body = await validateBody(req, validateCouponSchema);
  if (isValidationError(body)) return body;
  const { code, plan_id } = body;

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

  // Calculate discount amount for the plan
  const plan = await prisma.plan.findUnique({
    where: { id: plan_id },
  });

  if (!plan) {
    return NextResponse.json({ valid: false, reason: "Plan not found" });
  }

  // Use yearly price as default for discount calculation display
  const price = plan.yearlyPrice;
  let discountAmount: number;

  if (coupon.discountType === "percentage") {
    discountAmount = Math.floor(price * coupon.discountValue / 100);
  } else {
    discountAmount = Math.min(coupon.discountValue, price);
  }

  return NextResponse.json({
    valid: true,
    discount_type: coupon.discountType,
    discount_value: coupon.discountValue,
    discount_amount: discountAmount,
  });
}
