import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

/**
 * How far the account is with its first steps, for the dashboard checklist.
 *
 * A step counts as done when it was recorded (OnboardingStep, written by the
 * routes as things are created) or when the record simply exists: accounts that
 * created their first invoice before the steps were recorded, or through an
 * import, are not told to do it again. The company step has no such record to
 * look for, so it relies on the recorded step alone.
 */
export const GET = withAuth(async (_req, { tenantId }) => {
  const [steps, client, product, quote, invoice] = await Promise.all([
    prisma.onboardingStep.findMany({
      where: { tenantId, completed: true },
      select: { stepKey: true },
    }),
    prisma.client.findFirst({ where: { tenantId }, select: { id: true } }),
    prisma.product.findFirst({ where: { tenantId }, select: { id: true } }),
    prisma.quote.findFirst({ where: { tenantId }, select: { id: true } }),
    prisma.invoice.findFirst({ where: { tenantId }, select: { id: true } }),
  ]);
  const recorded = new Set(steps.map((s) => s.stepKey));

  return NextResponse.json({
    company_setup: recorded.has("company_setup"),
    first_client: recorded.has("first_client") || !!client,
    first_product: recorded.has("first_product") || !!product,
    first_quote: recorded.has("first_quote") || !!quote,
    first_invoice: recorded.has("first_invoice") || !!invoice,
  });
});
