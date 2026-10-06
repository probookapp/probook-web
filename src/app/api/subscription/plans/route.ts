import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { DEFAULT_BASIS } from "@/lib/alacarte";
import { readRate } from "@/lib/alacarte-server";
import { quoteCatalogue } from "@/lib/plan-pricing";
import { currencyForCountry } from "@/lib/currencies";

/** Detect the visitor's country from CDN / proxy headers. */
function detectCountry(req: NextRequest): string | null {
  // Vercel
  const vercel = req.headers.get("x-vercel-ip-country");
  if (vercel) return vercel;
  // Cloudflare
  const cf = req.headers.get("cf-ipcountry");
  if (cf && cf !== "XX") return cf;
  // AWS CloudFront
  const awsCf = req.headers.get("cloudfront-viewer-country");
  if (awsCf) return awsCf;
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const currency = req.nextUrl.searchParams.get("currency");

    // Auto-detect currency from visitor's country if no explicit currency requested
    const detectedCountry = detectCountry(req);
    const detectedCurrency = detectedCountry ? currencyForCountry(detectedCountry) : null;
    const effectiveCurrency = currency || detectedCurrency;

    // One rate per currency, or none — and none means the visitor is quoted the
    // catalogue as written rather than a figure nobody chose. Explicit
    // per-currency rows below still win: converting is the default, not a rule.
    const rate = await readRate(effectiveCurrency);

    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      include: {
        features: { include: { feature: true } },
        prices: true,
        // The composer needs each offer's seat ceiling to say, honestly, when a
        // bundle covers the same choice for less — a cheaper bundle that would
        // not fit the team is not a better deal.
        quotas: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    // One currency for the whole page — every offer in the visitor's, or every
    // offer in the catalogue's own. The same resolution the coupon check and the
    // approval use, so what is listed is what is billed.
    const quoted = quoteCatalogue(plans, effectiveCurrency, rate);

    const result = plans.map((plan, i) => {
      const snaked = toSnakeCase(plan) as Record<string, unknown>;

      // The currency the catalogue itself is written in, kept even when the
      // price below is resolved into the visitor's.
      snaked.base_currency = plan.currency;

      const resolved = quoted.prices[i];
      snaked.monthly_price = resolved.monthly;
      snaked.yearly_price = resolved.yearly;
      snaked.currency = resolved.currency;

      // The modules travel with the offers, in the same currency or not at all.
      // A module with no honest figure in it is listed without a price, which
      // keeps it off the composer rather than adding dinars to euros.
      const features = snaked.features as
        | { feature?: { unit_price?: number | null } }[]
        | undefined;
      for (const link of features ?? []) {
        if (link.feature?.unit_price != null) {
          link.feature.unit_price = quoted.convert(link.feature.unit_price);
        }
      }

      return snaked;
    });

    return NextResponse.json({
      plans: result,
      // In the offers' currency too, or absent when there is no honest figure.
      seat_price: quoted.convert(DEFAULT_BASIS.seatUnitPrice) ?? undefined,
      detected_currency: effectiveCurrency || null,
      detected_country: detectedCountry || null,
    });
  } catch (error) {
    console.error("[subscription/plans] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
