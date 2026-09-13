import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";
import { convertFromDzd, DEFAULT_BASIS, type CurrencyRate } from "@/lib/alacarte";

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

    // One rate per currency, or none — and none means the visitor is quoted the
    // catalogue as written rather than a figure nobody chose. Explicit
    // per-currency rows below still win: converting is the default, not a rule.
    const rateRow = effectiveCurrency
      ? await prisma.currencyRate.findUnique({ where: { code: effectiveCurrency } })
      : null;
    const rate: CurrencyRate | null = rateRow
      ? { code: rateRow.code, perDzd: Number(rateRow.perDzd), roundTo: rateRow.roundTo }
      : null;

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

    const result = plans.map((plan) => {
      const snaked = toSnakeCase(plan) as Record<string, unknown>;

      // The currency the catalogue itself is written in, kept even when the
      // price below is resolved into the visitor's. Module unit prices carry no
      // currency of their own, so the composer needs this to know whether it can
      // quote at all — showing dinars under a euro label would be a lie the page
      // tells confidently.
      snaked.base_currency = plan.currency;

      // If a currency is known (explicit or geo-detected), resolve the price for
      // it: a row typed by hand first, the rate otherwise.
      if (effectiveCurrency) {
        const match = plan.prices.find((p) => p.currency === effectiveCurrency);
        if (match) {
          snaked.monthly_price = match.monthlyPrice;
          snaked.yearly_price = match.yearlyPrice;
          snaked.currency = match.currency;
        } else if (rate && effectiveCurrency !== plan.currency) {
          snaked.monthly_price = convertFromDzd(plan.monthlyPrice, rate);
          snaked.yearly_price = convertFromDzd(plan.yearlyPrice, rate);
          snaked.currency = rate.code;

          // The modules travel with the offer. Leaving them in dinars while the
          // offer reads in euros is the mismatch this whole mechanism exists to
          // prevent — the composer would add francs to apples.
          const features = snaked.features as
            | { feature?: { unit_price?: number | null } }[]
            | undefined;
          for (const link of features ?? []) {
            if (link.feature?.unit_price != null) {
              link.feature.unit_price = convertFromDzd(link.feature.unit_price, rate);
            }
          }
        }
      }

      return snaked;
    });

    return NextResponse.json({
      plans: result,
      // Quoted in whatever currency the offers above are quoted in, so the
      // composer adds up numbers that already agree rather than converting a
      // second time with a rate it would have to be told about.
      seat_price: rate
        ? convertFromDzd(DEFAULT_BASIS.seatUnitPrice, rate)
        : DEFAULT_BASIS.seatUnitPrice,
      detected_currency: effectiveCurrency || null,
      detected_country: detectedCountry || null,
    });
  } catch (error) {
    console.error("[subscription/plans] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
