import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions-server";
import { prisma } from "@/lib/db";

// GET /api/clients/[id]/statement?startDate&endDate
//
// Builds a per-client ledger (running balance) from three sources:
//   - non-DRAFT invoices  -> DEBIT  (+total)  dated issueDate
//   - actual payments     -> CREDIT (-amount) dated paymentDate (linked via invoice.clientId)
//   - ISSUED credit notes -> CREDIT (-total)  dated issueDate
//
// opening_balance = net of every entry strictly BEFORE startDate (0 when no startDate).
// entries[]       = merged, date-sorted list within the range, each carrying a running balance.
// totals          = invoiced / paid / credited within the range + closing balance (what the client owes).

type LedgerEvent = {
  time: number;
  date: Date;
  type: "invoice" | "payment" | "credit_note";
  reference: string;
  debit: number;
  credit: number;
};

export const GET = withAuth(async (req, { tenantId, session, params }) => {
  const denied = await requirePermission(session, "clients", "view");
  if (denied) return denied;
  const clientId = params?.id as string;

  const client = await prisma.client.findFirst({
    where: { tenantId, id: clientId },
    select: { id: true, name: true },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const startTime = startDate ? new Date(startDate).getTime() : null;
  // endDate is inclusive: allow the whole day by pushing the bound to next midnight.
  const endExclusive = endDate ? new Date(endDate).getTime() + 86400000 : null;

  const [invoices, payments, creditNotes] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId, clientId, status: { not: "DRAFT" } },
      select: { invoiceNumber: true, issueDate: true, total: true, stampDuty: true },
    }),
    prisma.payment.findMany({
      where: { tenantId, invoice: { clientId } },
      select: {
        amount: true,
        paymentDate: true,
        reference: true,
        invoice: { select: { invoiceNumber: true } },
      },
    }),
    prisma.creditNote.findMany({
      where: { tenantId, clientId, status: "ISSUED" },
      select: { creditNoteNumber: true, issueDate: true, total: true },
    }),
  ]);

  const events: LedgerEvent[] = [];

  for (const inv of invoices) {
    events.push({
      time: new Date(inv.issueDate).getTime(),
      date: inv.issueDate,
      type: "invoice",
      reference: inv.invoiceNumber,
      // The client owes the TTC total plus the stamp duty (droit de timbre) snapshot.
      debit: inv.total + (inv.stampDuty ?? 0),
      credit: 0,
    });
  }
  for (const pay of payments) {
    events.push({
      time: new Date(pay.paymentDate).getTime(),
      date: pay.paymentDate,
      type: "payment",
      reference: pay.reference || pay.invoice.invoiceNumber,
      debit: 0,
      credit: pay.amount,
    });
  }
  for (const cn of creditNotes) {
    events.push({
      time: new Date(cn.issueDate).getTime(),
      date: cn.issueDate,
      type: "credit_note",
      reference: cn.creditNoteNumber,
      debit: 0,
      credit: cn.total,
    });
  }

  // Opening balance: everything strictly before the start of the range.
  let openingBalance = 0;
  if (startTime !== null) {
    for (const e of events) {
      if (e.time < startTime) openingBalance += e.debit - e.credit;
    }
  }

  // In-range entries, chronologically sorted (invoices/credit notes before payments on the same day).
  const typeOrder = { invoice: 0, credit_note: 1, payment: 2 } as const;
  const inRange = events
    .filter(
      (e) =>
        (startTime === null || e.time >= startTime) &&
        (endExclusive === null || e.time < endExclusive)
    )
    .sort((a, b) => a.time - b.time || typeOrder[a.type] - typeOrder[b.type]);

  let running = openingBalance;
  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalCredited = 0;

  const entries = inRange.map((e) => {
    running += e.debit - e.credit;
    if (e.type === "invoice") totalInvoiced += e.debit;
    else if (e.type === "payment") totalPaid += e.credit;
    else totalCredited += e.credit;
    return {
      date: e.date,
      type: e.type,
      reference: e.reference,
      debit: e.debit,
      credit: e.credit,
      runningBalance: running,
    };
  });

  const result = {
    client,
    startDate: startDate || null,
    endDate: endDate || null,
    openingBalance,
    entries,
    totals: {
      totalInvoiced,
      totalPaid,
      totalCredited,
      closingBalance: running,
    },
  };

  return NextResponse.json(toSnakeCase(result));
});
