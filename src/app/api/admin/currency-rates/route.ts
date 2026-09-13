import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import {
  withPlatformAdmin,
  withSuperAdmin,
  logAuditEvent,
  getClientIp,
} from "@/lib/admin-api-utils";
import { validateBody, isValidationError } from "@/lib/validate";
import { currencyRateSchema } from "@/lib/validations";

/**
 * What one dinar is worth elsewhere.
 *
 * Every price in the product is written once, in DZD. This is the only other
 * number needed to publish that grid abroad — the offers, the à la carte
 * modules and the extra seats all convert from it, so they cannot drift apart
 * the way a second hand-typed set of figures did in production.
 *
 * A currency with no row here is simply not offered, which is the honest
 * default: better to quote nobody than to quote a rate nobody chose.
 */
export const GET = withPlatformAdmin(async () => {
  const rates = await prisma.currencyRate.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json(toSnakeCase(rates));
});

export const PUT = withSuperAdmin(async (req, ctx) => {
  const body = await validateBody(req, currencyRateSchema);
  if (isValidationError(body)) return body;

  const code = body.code.toUpperCase();
  const rate = await prisma.currencyRate.upsert({
    where: { code },
    create: { code, perDzd: body.per_dzd, roundTo: body.round_to ?? 100 },
    update: { perDzd: body.per_dzd, roundTo: body.round_to ?? 100 },
  });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "currency_rate.set",
    targetType: "currency_rate",
    targetId: code,
    metadata: { perDzd: body.per_dzd, roundTo: body.round_to ?? 100 },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(toSnakeCase(rate));
});

export const DELETE = withSuperAdmin(async (req, ctx) => {
  const code = new URL(req.url).searchParams.get("code")?.toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "Missing currency code" }, { status: 400 });
  }

  // Removing a rate stops the currency being offered — prices revert to the
  // catalogue's own. Nothing already sold changes: a subscription carries the
  // figure it was bought at.
  await prisma.currencyRate.deleteMany({ where: { code } });

  await logAuditEvent({
    actorType: "platform_admin",
    actorId: ctx.adminId,
    action: "currency_rate.remove",
    targetType: "currency_rate",
    targetId: code,
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ removed: code });
});
