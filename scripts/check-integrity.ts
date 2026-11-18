// Read-only diagnostic: cash journal chains + invoice integrity hashes. Only SELECTs.
// Run against prod:  npx dotenv -e .env -- npx tsx scripts/check-integrity.ts
import { prisma } from "../src/lib/db";
import { verifyInvoiceIntegrityHash } from "../src/lib/invoice-integrity";
import { verifyChain } from "../src/lib/pos-journal";
import { num } from "../src/lib/money";

async function main() {
  // 1. Cash journal
  const entries = await prisma.posJournalEntry.findMany({ orderBy: [{ tenantId: "asc" }, { sequence: "asc" }] });
  const byTenant = new Map<string, typeof entries>();
  for (const e of entries) byTenant.set(e.tenantId, [...(byTenant.get(e.tenantId) ?? []), e]);
  console.log(`journal entries: ${entries.length} across ${byTenant.size} tenants`);
  if (entries.length) {
    console.log(`  first: ${entries.map((e) => e.createdAt).sort((a, b) => +a - +b)[0].toISOString()}`);
    const kinds: Record<string, number> = {};
    for (const e of entries) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    console.log("  kinds:", JSON.stringify(kinds));
    let ok = 0, bad = 0;
    for (const [, list] of byTenant) {
      const v = verifyChain(list as never);
      if (v.ok) ok++; else bad++;
    }
    console.log(`  chains verifying with local key chain (POS_JOURNAL_SECRET→INVOICE_INTEGRITY_SECRET→JWT_SECRET): ok=${ok} broken=${bad}`);
  }
  console.log(`closures: ${await prisma.posClosure.count()}`);

  // 2. Invoice hashes
  const invoices = await prisma.invoice.findMany({
    where: { status: { not: "DRAFT" } },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  let v2ok = 0, v2bad = 0, legacyOk = 0, legacyBad = 0, none = 0;
  for (const invoice of invoices) {
    if (!invoice.integrityHash) { none++; continue; }
    const { valid } = verifyInvoiceIntegrityHash(invoice.integrityHash, {
      invoiceNumber: invoice.invoiceNumber, clientId: invoice.clientId,
      issueDate: invoice.issueDate, dueDate: invoice.dueDate,
      subtotal: num(invoice.subtotal), taxAmount: num(invoice.taxAmount), total: num(invoice.total),
      shippingCost: num(invoice.shippingCost), stampDuty: num(invoice.stampDuty),
      isCashSale: invoice.isCashSale, stampDutyExempt: invoice.stampDutyExempt,
      lines: invoice.lines.map((l) => ({
        description: l.description, quantity: l.quantity, unitPrice: num(l.unitPrice),
        taxRate: l.taxRate, subtotal: num(l.subtotal), total: num(l.total),
      })),
    });
    const v2 = invoice.integrityHash.startsWith("v2:");
    if (v2 && valid) v2ok++;
    else if (v2) v2bad++;
    else if (valid) legacyOk++;
    else legacyBad++;
  }
  console.log(`non-draft invoices: ${invoices.length} — v2 ok=${v2ok} v2 mismatch=${v2bad} legacy ok=${legacyOk} legacy mismatch=${legacyBad} no hash=${none}`);
  const sales = await prisma.posTransaction?.count?.().catch(() => null);
  if (sales != null) console.log(`pos transactions (all time): ${sales}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
