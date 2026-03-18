import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

/** Map ISO 3166-1 alpha-2 country code to currency. */
function countryToCurrency(country: string): string {
  const map: Record<string, string> = {
    // North Africa
    DZ: "DZD", MA: "MAD", TN: "TND", LY: "LYD", EG: "EGP",
    // Eurozone
    FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR",
    PT: "EUR", AT: "EUR", IE: "EUR", FI: "EUR", GR: "EUR", LU: "EUR",
    // USD
    US: "USD", PR: "USD", GU: "USD",
    // GBP
    GB: "GBP",
    // CAD
    CA: "CAD",
    // Gulf
    SA: "SAR", AE: "AED", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR",
    // Other
    TR: "TRY", JP: "JPY", CN: "CNY", IN: "INR", BR: "BRL",
  };
  return map[country.toUpperCase()] || "USD";
}

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
    const detectedCurrency = detectedCountry ? countryToCurrency(detectedCountry) : null;
    const effectiveCurrency = currency || detectedCurrency;

    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      include: {
        features: { include: { feature: true } },
        prices: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    const result = plans.map((plan) => {
      const snaked = toSnakeCase(plan) as Record<string, unknown>;

      // If a currency is known (explicit or geo-detected), resolve the price for it
      if (effectiveCurrency) {
        const match = plan.prices.find((p) => p.currency === effectiveCurrency);
        if (match) {
          snaked.monthly_price = match.monthlyPrice;
          snaked.yearly_price = match.yearlyPrice;
          snaked.currency = match.currency;
        }
      }

      return snaked;
    });

    return NextResponse.json({
      plans: result,
      detected_currency: effectiveCurrency || null,
      detected_country: detectedCountry || null,
    });
  } catch (error) {
    console.error("[subscription/plans] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
