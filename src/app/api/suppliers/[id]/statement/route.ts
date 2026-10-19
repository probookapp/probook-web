import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";
import { getSupplierLedgerEvents, LEDGER_TYPE_ORDER } from "@/lib/supplier-account";

// GET /api/suppliers/[id]/statement?startDate&endDate
//
// The supplier's account as a ledger with a running balance, the mirror of the
// client statement. Debits add to what the business owes (opening balance owed,
// received orders, adjustments up); credits take it off (payments, returns,
// adjustments down, an opening balance in the business's favour).
//
// opening_balance = net of every entry strictly BEFORE startDate (0 when no startDate).
// totals.closing_balance = what the business owes at the end of the range;
// negative means the supplier holds credit.
export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "suppliers", "view");
  if (denied) return denied;
  const supplierId = params?.id as string;

  const supplier = await prisma.supplier.findFirst({
    where: { tenantId, id: supplierId },
    select: { id: true, name: true },
  });
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const startTime = startDate ? new Date(startDate).getTime() : null;
  // endDate is inclusive: allow the whole day by pushing the bound to next midnight.
  const endExclusive = endDate ? new Date(endDate).getTime() + 86400000 : null;

  const events = await getSupplierLedgerEvents(prisma, tenantId, supplierId);

  let openingBalance = 0;
  if (startTime !== null) {
    for (const e of events) {
      if (e.time < startTime) openingBalance += e.debit - e.credit;
    }
  }

  const inRange = events
    .filter(
      (e) =>
        (startTime === null || e.time >= startTime) &&
        (endExclusive === null || e.time < endExclusive)
    )
    .sort((a, b) => a.time - b.time || LEDGER_TYPE_ORDER[a.type] - LEDGER_TYPE_ORDER[b.type]);

  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  const entries = inRange.map((e) => {
    running += e.debit - e.credit;
    totalDebit += e.debit;
    totalCredit += e.credit;
    return {
      date: e.date,
      type: e.type,
      reference: e.reference,
      label: e.label,
      recordId: e.recordId,
      debit: e.debit,
      credit: e.credit,
      runningBalance: running,
    };
  });

  return NextResponse.json(
    toSnakeCase({
      supplier,
      startDate: startDate || null,
      endDate: endDate || null,
      openingBalance,
      entries,
      totals: { totalDebit, totalCredit, closingBalance: running },
    })
  );
});
