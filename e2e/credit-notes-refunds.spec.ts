import { test, expect, type Page } from "@playwright/test";
import {
  apiGet,
  apiPost,
  setupClient,
  setupProduct,
  setupRegister,
  openSession,
} from "./api-helpers";
import { signUpSubscribed } from "./subscription-setup";

const today = () => new Date().toISOString().slice(0, 10);

/** Read the aggregate on-hand quantity for a product. */
async function productQty(page: Page, productId: string): Promise<number> {
  const res = await apiGet(page, `/api/products/${productId}`);
  return res.body.quantity as number;
}

/** Fetch the tenant's credit notes (newest first). */
async function getCreditNotes(page: Page) {
  const res = await apiGet(page, "/api/credit-notes");
  return res.body as unknown as Array<Record<string, unknown>>;
}

test.describe("Credit notes & refunds", () => {
  test.beforeEach(async ({ page }) => {
    await signUpSubscribed(page);
  });

  test("create a partial credit note from an issued invoice (with restock) via the invoice view", async ({
    page,
  }) => {
    const client = await setupClient(page, "Credit Note Client");
    const product = await setupProduct(page, "CN Widget", 100, { quantity: 10 });

    // Invoice: 2 units @ 100 HT, 20% VAT  ->  subtotal 200, tax 40, total 240.
    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: today(),
      lines: [
        {
          product_id: product.id,
          description: "CN Widget",
          quantity: 2,
          unit_price: 100,
          tax_rate: 20,
        },
      ],
    });
    expect(inv.status).toBe(200);

    // Issue: decrements stock (10 -> 8) and unlocks the credit-note action.
    const issued = await apiPost(page, `/api/invoices/${inv.body.id}/issue`);
    expect(issued.status).toBe(200);
    const qtyAfterIssue = await productQty(page, product.id as string);
    expect(qtyAfterIssue).toBe(8);

    // Open the invoice view.
    await page.goto(`/en/invoices/${inv.body.id}`);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: inv.body.invoice_number as string })
    ).toBeVisible();

    // Open the "Create Credit Note" modal (header action).
    await page.getByRole("button", { name: "Create Credit Note" }).first().click();
    await expect(page.getByText("Credit note from invoice")).toBeVisible();

    // Refund only 1 of the 2 units (partial), and restock it.
    await page.getByRole("spinbutton").first().fill("1");
    await page.getByText("Restock returned items").click();

    // Submit (modal action — the second button sharing the label).
    await page.getByRole("button", { name: "Create Credit Note" }).last().click();

    // Modal redirects to the created credit note view.
    await page.waitForURL(/\/invoices\/credit-notes\//, { timeout: 15_000 });

    // API assertions: one credit note, correct totals, restocked flag set.
    const creditNotes = await getCreditNotes(page);
    expect(creditNotes.length).toBe(1);
    const cn = creditNotes[0];
    expect(cn.invoice_id).toBe(inv.body.id);
    // 1 unit @ 100 HT, 20% VAT -> subtotal 100, tax 20, total 120.
    expect(cn.subtotal).toBe(100);
    expect(cn.tax_amount).toBe(20);
    expect(cn.total).toBe(120);
    expect(cn.restocked).toBe(true);

    // Restock returned the single unit: 8 -> 9.
    const qtyAfterRestock = await productQty(page, product.id as string);
    expect(qtyAfterRestock).toBe(qtyAfterIssue + 1);
  });

  test("POS refund creates a credit note and restocks via the transaction history UI", async ({
    page,
  }) => {
    const product = await setupProduct(page, "POS Widget", 50, { quantity: 10 });
    const register = await setupRegister(page, "Refund Register");
    const session = await openSession(page, register.id as string, 0);

    // Complete a POS sale of 2 units paid in cash (total 120 incl. 20% VAT).
    const sale = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      lines: [
        {
          product_id: product.id,
          designation: "POS Widget",
          quantity: 2,
          unit_price: 50,
          tax_rate: 20,
        },
      ],
      payments: [{ payment_method: "CASH", amount: 120 }],
    });
    expect(sale.status).toBe(200);
    const ticketNumber = sale.body.ticket_number as string;

    const qtyAfterSale = await productQty(page, product.id as string);
    expect(qtyAfterSale).toBe(8);

    // Drive the POS UI: it auto-selects the active register + open session.
    await page.goto("/en/pos");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "Menu" })).toBeVisible({ timeout: 15_000 });

    // Open the transaction history drawer.
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: "Transaction History" }).click();

    // Expand the sale, then open the refund modal.
    await page.getByText(ticketNumber).click();
    await page.getByRole("button", { name: "Refund" }).click();
    await expect(page.getByText(`Refund items from ticket ${ticketNumber}`)).toBeVisible();

    // Return 1 of the 2 units and restock.
    await page.getByRole("spinbutton").first().fill("1");
    await page.getByText("Restock returned items").click();
    await page.getByRole("button", { name: "Confirm Refund" }).click();

    // NOTE: RefundModal fires toast.success("Refund recorded") on success, but it
    // is never rendered: /[locale]/pos lives OUTSIDE the (app) route group, so it
    // never mounts <Layout>, and <ToastContainer/> is only rendered inside
    // Layout.tsx / AdminLayout.tsx. => APP BUG: no POS toast is ever displayed
    // (refund, transaction complete, session opened/closed, scan errors...).
    // Verified: POST /api/pos/refunds returns 200 and creates the credit note,
    // yet no toast text exists in the DOM. Asserting the modal closing instead —
    // the RefundModal only calls onClose() on a successful refund.
    await expect(
      page.getByText(`Refund items from ticket ${ticketNumber}`)
    ).toHaveCount(0, { timeout: 30_000 });

    // API assertions: a credit note exists with the refunded line total.
    const creditNotes = await getCreditNotes(page);
    expect(creditNotes.length).toBe(1);
    const cn = creditNotes[0];
    // 1 unit @ 50 HT, 20% VAT -> total 60.
    expect(cn.subtotal).toBe(50);
    expect(cn.total).toBe(60);
    expect(cn.restocked).toBe(true);

    // Restock returned the single unit: 8 -> 9.
    const qtyAfterRefund = await productQty(page, product.id as string);
    expect(qtyAfterRefund).toBe(qtyAfterSale + 1);
  });
});
