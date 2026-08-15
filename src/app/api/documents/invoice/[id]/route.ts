import { NextResponse } from "next/server";
import React from "react";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { renderDocument } from "@/features/pdf/render-server";
import { InvoicePDF } from "@/features/pdf/InvoicePDF";
import { documentLocale, SERVER_DOCUMENT_LOCALES } from "@/features/pdf/text";
import type { Invoice, CompanySettings } from "@/types";

/**
 * An invoice as a PDF, rendered on the server.
 *
 * This is the only path that can embed a font, and an embedded font is the only
 * way an Arabic document can exist: Helvetica — one of the fourteen faces every
 * reader carries — has no Arabic glyphs, and pdfkit prints a truncated byte
 * rather than refusing, so an Arabic invoice came out reading "A5HD'" where
 * "الوصف" belonged.
 *
 * It took three attempts to get here, and the obstacle was never @react-pdf. It
 * was `@/i18n`, which reaches the document components through lib/utils, the
 * settings store and pdf/identifiers, and which imports react-i18next — whose
 * `createContext` call has nothing to bind to outside a browser. With those
 * three threads cut, an ordinary route handler renders a document.
 */
export const runtime = "nodejs";

export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "invoices", "view");
  if (denied) return denied;

  const invoice = await prisma.invoice.findFirst({
    where: { id: params?.id, tenantId },
    include: { client: true, lines: { orderBy: { position: "asc" } }, payments: true },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });

  const requested = new URL(req.url).searchParams.get("locale") ?? "fr";
  const locale = documentLocale(requested, SERVER_DOCUMENT_LOCALES);

  const pdf = await renderDocument(
    React.createElement(InvoicePDF, {
      invoice: toSnakeCase(invoice) as unknown as Invoice,
      company: toSnakeCase(settings) as unknown as CompanySettings,
      locale,
      currency: settings?.currency || "DZD",
      // Arabic needs a face that has Arabic glyphs at all; Latin documents get
      // the same family as the interface, now that embedding is possible.
      fontFamily: locale === "ar" ? "IBM Plex Sans Arabic" : "IBM Plex Sans",
    })
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});
