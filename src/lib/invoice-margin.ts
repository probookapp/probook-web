/**
 * Margin and settlement of each invoice: what it sold, what the goods cost,
 * what the client has paid and what is still owed.
 *
 * The per-product margin report answers "which articles pay"; this one answers
 * "what did each sale earn, and is it paid". Only invoices count: a quote is a
 * promise and a delivery note a movement of goods, and both end up as an
 * invoice when they become a sale — counting them too would count it twice.
 *
 * Plain numbers in, plain numbers out, so the API route and the demo data
 * compute it the same way.
 */

export interface InvoiceMarginLineInput {
  productId: string | null;
  quantity: number;
  /** Purchase price frozen when the invoice was issued. */
  costPriceSnapshot: number;
  isSubtotalLine?: boolean | null;
  /** A pack header: its components carry the cost, so the header carries none. */
  isBundleHeader?: boolean | null;
}

export interface InvoiceMarginCreditNoteInput {
  /** Pre-tax amount credited back to the client. */
  subtotal: number;
  /** Goods that came back to the shelf were not, in the end, given away. */
  restocked: boolean;
  lines: { productId: string | null; quantity: number }[];
}

export interface InvoiceMarginInput {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  issueDate: string;
  status: string;
  /** Taxable base: lines after every discount, plus shipping. */
  subtotal: number;
  total: number;
  /** Droit de timbre snapshot: owed on top of the TTC total, as on the invoice page. */
  stampDuty: number;
  lines: InvoiceMarginLineInput[];
  payments: { amount: number }[];
  creditNotes: InvoiceMarginCreditNoteInput[];
}

export interface InvoiceMarginRow {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  issueDate: string;
  /** Pre-tax sales, net of the credit notes issued against the invoice. */
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
  /** What the client has to pay: TTC total plus stamp duty. */
  amountDue: number;
  paid: number;
  remaining: number;
}

export interface InvoiceMarginReport {
  rows: InvoiceMarginRow[];
  /** Expenses dated in the same period, to be taken off the margin. */
  expensesTotal: number;
  expenseCount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Below a centime, a balance is settled. */
const EPSILON = 0.005;

export function invoiceMarginRow(invoice: InvoiceMarginInput): InvoiceMarginRow {
  const unitCost = new Map<string, number>();
  let cost = 0;
  for (const line of invoice.lines) {
    if (line.isSubtotalLine || line.isBundleHeader) continue;
    cost += line.quantity * line.costPriceSnapshot;
    if (line.productId && !unitCost.has(line.productId)) unitCost.set(line.productId, line.costPriceSnapshot);
  }

  let revenue = invoice.subtotal;
  for (const note of invoice.creditNotes) {
    revenue -= note.subtotal;
    if (!note.restocked) continue;
    for (const line of note.lines) {
      if (line.productId) cost -= line.quantity * (unitCost.get(line.productId) ?? 0);
    }
  }

  const amountDue = invoice.total + invoice.stampDuty;
  let paid = invoice.payments.reduce((s, p) => s + p.amount, 0);
  // A PAID invoice is settled whatever its payment lines say: invoices marked
  // paid before payments were recorded one by one carry none.
  if (invoice.status === "PAID") paid = Math.max(paid, amountDue);
  const remaining = amountDue - paid;

  const margin = revenue - cost;
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    clientId: invoice.clientId,
    clientName: invoice.clientName,
    issueDate: invoice.issueDate,
    revenue: round2(revenue),
    cost: round2(cost),
    margin: round2(margin),
    marginPercent: revenue !== 0 ? round2((margin / revenue) * 100) : 0,
    amountDue: round2(amountDue),
    paid: round2(paid),
    remaining: remaining > EPSILON ? round2(remaining) : 0,
  };
}

export function invoiceMarginReport(
  invoices: InvoiceMarginInput[],
  expenses: { amount: number }[]
): InvoiceMarginReport {
  return {
    rows: invoices
      .map(invoiceMarginRow)
      // Newest first, the way the invoice list reads.
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.invoiceNumber.localeCompare(a.invoiceNumber)),
    expensesTotal: round2(expenses.reduce((s, e) => s + e.amount, 0)),
    expenseCount: expenses.length,
  };
}
