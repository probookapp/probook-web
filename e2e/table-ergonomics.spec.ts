import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupClient, setupIssuedInvoice } from "./api-helpers";

/**
 * List ergonomics: the row opens its document, the rarer actions live in a
 * "⋯" menu, the columns a person hides stay hidden (saved to their account, so
 * a reload — or another device — keeps the choice), an empty column steps aside
 * on its own, and the page's buttons stay in reach while the list scrolls.
 */
const LINE = [{ description: "Prestation", quantity: 1, unit_price: 10000, tax_rate: 19 }];

test.describe("Table ergonomics", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signUp(page);
  });

  test("row click, actions menu, column picker and sticky header on invoices", async ({ page }) => {
    const client = await setupClient(page, "Ergonomie SARL");
    const issued = await setupIssuedInvoice(page, { client_id: client.id, issue_date: "2026-06-01", lines: LINE });
    for (let i = 0; i < 24; i++) {
      await apiPost(page, "/api/invoices", { client_id: client.id, issue_date: "2026-06-02", lines: LINE });
    }

    await page.goto("/en/invoices");
    const table = page.locator("table").filter({ visible: true });
    const header = table.locator("thead");

    // No invoice carries a label, so the Labels column is not drawn at all.
    await expect(header.getByText("Number", { exact: false }).first()).toBeVisible();
    await expect(header.getByText(/labels|tags/i)).toHaveCount(0);

    // The issued invoice offers "mark as paid" inline; the rest is in the menu.
    const issuedRow = table.getByRole("row").filter({ hasText: issued.body.invoice_number as string });
    await expect(issuedRow.getByRole("button", { name: /mark as paid/i })).toBeVisible();
    await expect(issuedRow.getByRole("button", { name: "Duplicate" })).toHaveCount(0);
    await issuedRow.getByRole("button", { name: "More actions" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /download pdf/i })).toBeVisible();

    // The PDF item downloads a file, rather than opening the invoice.
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      menu.getByRole("menuitem", { name: /download pdf/i }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`${issued.body.invoice_number}.pdf`);
    await expect(page).toHaveURL(/\/en\/invoices$/);

    // Hiding a column is saved to the account and survives a reload.
    await page.getByRole("button", { name: /^Columns/ }).click();
    await page.getByRole("menuitemcheckbox", { name: /due date/i }).click();
    await page.keyboard.press("Escape");
    await expect(header.getByText(/due date/i)).toHaveCount(0);
    await expect
      .poll(async () => ((await apiGet(page, "/api/auth/table-preferences")).body as Record<string, { hidden: string[] }>).invoices?.hidden)
      .toEqual(["dueDate"]);
    await page.reload();
    await expect(header.getByText("Number", { exact: false }).first()).toBeVisible();
    await expect(header.getByText(/due date/i)).toHaveCount(0);

    // The page's buttons stay in view while the list scrolls.
    await page.locator("main").evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(page.getByRole("button", { name: /new invoice/i }).first()).toBeInViewport();

    // Clicking a row opens its invoice.
    await page.locator("main").evaluate((el) => el.scrollTo(0, 0));
    await issuedRow.getByText("Ergonomie SARL").click();
    await expect(page).toHaveURL(new RegExp(`/en/invoices/${issued.body.id}$`));
  });

  test("a phone card leads with the client, and tapping it opens the quote", async ({ page }) => {
    const client = await setupClient(page, "Entreprise Benali Frères Import Export");
    const quote = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2026-10-08",
      validity_date: "2026-11-08",
      lines: LINE,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/quotes");

    // The client is the card's title; the number sits in the small grey line.
    const title = page.getByText(client.name as string, { exact: true }).filter({ visible: true });
    const number = page.getByText(quote.body.quote_number as string).filter({ visible: true });
    await expect(title).toHaveCSS("font-weight", "600");
    expect(parseFloat(await number.evaluate((el) => getComputedStyle(el).fontSize))).toBeLessThan(
      parseFloat(await title.evaluate((el) => getComputedStyle(el).fontSize))
    );

    // One inline action (edit, on a draft) and the rest behind "⋯".
    await expect(page.getByRole("button", { name: "Duplicate" }).filter({ visible: true })).toHaveCount(0);
    // The card's own "⋯" — the page header has one too on a phone.
    await page.locator("main .md\\:hidden.divide-y").getByRole("button", { name: "More actions" }).first().click();
    await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.screenshot({ path: test.info().outputPath("phone-quotes.png") });

    await title.click();
    await expect(page).toHaveURL(new RegExp(`/en/quotes/${quote.body.id}$`));
  });
});
