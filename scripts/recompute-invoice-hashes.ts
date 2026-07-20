/**
 * One-time maintenance script (run after the money→Decimal migration):
 *
 *   npx dotenv -e .env -- npx tsx scripts/recompute-invoice-hashes.ts
 *
 * Invoices issued BEFORE the round2-at-persistence fix stored unrounded float
 * totals; the Decimal migration rounds those values to 3 decimals, so their
 * stored integrity hash (computed over the unrounded numbers) no longer
 * matches. This re-stamps a v2 HMAC hash over the current (converted) values
 * for every non-DRAFT invoice. Invoices already carrying a matching hash are
 * rewritten to the same value — running this twice is harmless.
 */
import { prisma } from "../src/lib/db";
import { computeInvoiceIntegrityHash } from "../src/lib/invoice-integrity";
import { num } from "../src/lib/money";

async function main() {
  const invoices = await prisma.invoice.findMany({
    where: { status: { not: "DRAFT" } },
    include: { lines: { orderBy: { position: "asc" } } },
  });

  let updated = 0;
  for (const invoice of invoices) {
    const hash = computeInvoiceIntegrityHash({
      invoiceNumber: invoice.invoiceNumber,
      clientId: invoice.clientId,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      subtotal: num(invoice.subtotal),
      taxAmount: num(invoice.taxAmount),
      total: num(invoice.total),
      shippingCost: num(invoice.shippingCost),
      stampDuty: num(invoice.stampDuty),
      isCashSale: invoice.isCashSale,
      stampDutyExempt: invoice.stampDutyExempt,
      lines: invoice.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: num(l.unitPrice),
        taxRate: l.taxRate,
        subtotal: num(l.subtotal),
        total: num(l.total),
      })),
    });
    if (hash !== invoice.integrityHash) {
      await prisma.invoice.update({ where: { id: invoice.id }, data: { integrityHash: hash } });
      updated++;
    }
  }

  console.log(`Checked ${invoices.length} non-draft invoices, re-stamped ${updated} hashes.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
