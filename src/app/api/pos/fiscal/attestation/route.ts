import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { FISCAL_SOFTWARE } from "@/lib/pos-journal";

/**
 * What the publisher's individual attestation (BOI-LETTRE-000242, re-allowed
 * by loi n° 2026-103 art. 125) is filled with: the publisher's identity, from
 * the deployment's environment, and the merchant's, from the account. The
 * document itself is drawn in the browser (AttestationPDF).
 *
 * The attestation engages the publisher's responsibility, so it is only
 * offered once the publisher has filled in its identity: without
 * FISCAL_EDITOR_* the answer says so instead of printing blanks.
 */
export const GET = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "reports", "view");
  if (denied) return denied;

  const editor = {
    company: process.env.FISCAL_EDITOR_COMPANY ?? "",
    representative: process.env.FISCAL_EDITOR_REPRESENTATIVE ?? "",
    city: process.env.FISCAL_EDITOR_CITY ?? "",
    // When this major version was put on the market (YYYY-MM-DD).
    market_date: process.env.FISCAL_EDITOR_MARKET_DATE ?? "",
  };
  if (!editor.company || !editor.representative || !editor.city || !editor.market_date) {
    return NextResponse.json(
      { error: "The software publisher's identity is not configured", code: "EDITOR_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const [tenant, settings, firstSale] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { createdAt: true, ownerUserId: true } }),
    prisma.companySettings.findFirst({
      where: { tenantId },
      select: { companyName: true, address: true, postalCode: true, city: true, siret: true },
    }),
    prisma.posJournalEntry.findFirst({
      where: { tenantId, kind: { in: ["SALE", "PAYMENT"] } },
      orderBy: { sequence: "asc" },
      select: { occurredAt: true },
    }),
  ]);
  const owner = tenant?.ownerUserId
    ? await prisma.user.findFirst({ where: { tenantId, id: tenant.ownerUserId }, select: { displayName: true } })
    : null;

  return NextResponse.json({
    editor,
    software: FISCAL_SOFTWARE,
    merchant: {
      company: settings?.companyName ?? "",
      representative: owner?.displayName ?? "",
      address: [settings?.address, settings?.postalCode, settings?.city].filter(Boolean).join(" "),
      siret: settings?.siret ?? "",
      acquired_at: tenant?.createdAt ?? null,
      used_since: firstSale?.occurredAt ?? null,
    },
  });
});
