import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { apiPost, setupClient, setupProduct, setupIssuedInvoice } from "./api-helpers";

/** Two customer reports: an edited quote showing one line, and PDFs not coming out. */
const LINES = [
  { description: "Caméra IP extérieure", quantity: 3, unit_price: 24500, tax_rate: 19 },
  { description: "Installation & mise en service", quantity: 1, unit_price: 5000, tax_rate: 19 },
  { description: "Câble réseau (rouleau)", quantity: 2, unit_price: 1800, tax_rate: 19 },
];

async function aQuoteOfThreeLines(page: Page) {
  const client = await setupClient(page, "Client Trois Lignes");
  const res = await apiPost(page, "/api/quotes", {
    client_id: client.id,
    issue_date: "2026-09-01",
    validity_date: "2026-10-01",
    lines: LINES,
  });
  expect(res.status).toBe(200);
  expect((res.body.lines as unknown[]).length).toBe(3);
  return res.body.id as string;
}

test.describe("Editing a quote with several lines", () => {
  for (const view of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    test(`every line is there on ${view.name}`, async ({ page }) => {
      await page.setViewportSize({ width: view.width, height: view.height });
      await signUp(page);
      const id = await aQuoteOfThreeLines(page);

      await page.goto(`/en/quotes/${id}/edit`);
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(600);

      if (view.name === "desktop") {
        // The wide editor writes each description into its own input.
        const described = await page
          .locator('input[name^="lines."][name$=".description"]')
          .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
        expect(described).toEqual(LINES.map((l) => l.description));
      } else {
        // The phone editor folds them into a list of rows, one per article.
        for (const line of LINES) {
          await expect(
            page.getByText(line.description, { exact: true }).first(),
            `"${line.description}" should be on screen`
          ).toBeVisible();
        }
        // …and the sheet walks between them rather than trapping the reader on one.
        await page.locator("li > button").first().click();
        const sheet = page.getByRole("dialog");
        await expect(sheet.getByText("1 / 3")).toBeVisible();
        await sheet.getByRole("button", { name: "Next line" }).click();
        await expect(sheet.getByText("2 / 3")).toBeVisible();
        await expect(sheet.locator('input[name="lines.1.description"]')).toHaveValue(
          LINES[1].description
        );
      }
    });
  }
});

test.describe("PDF generation", () => {
  for (const locale of ["fr", "en", "ar"]) {
    test(`an invoice, a quote and a delivery note come out as PDFs in ${locale}`, async ({ page }) => {
      test.setTimeout(180_000);
      const failures: string[] = [];
      page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
      page.on("requestfailed", (r) => {
        if (/\/fonts\/|\.ttf|\.wasm/.test(r.url())) failures.push(`asset: ${r.url()} ${r.failure()?.errorText}`);
      });

      await signUp(page);
      const client = await setupClient(page, "Client PDF");
      const product = await setupProduct(page, "Caméra IP extérieure", 24500, { quantity: 20 });
      const invoice = await setupIssuedInvoice(page, {
        client_id: client.id,
        issue_date: "2026-09-01",
        lines: [{ description: "Caméra IP extérieure", quantity: 2, unit_price: 24500, tax_rate: 19, product_id: product.id }],
      });
      const quote = await apiPost(page, "/api/quotes", {
        client_id: client.id, issue_date: "2026-09-01", validity_date: "2026-10-01", lines: LINES,
      });
      const note = await apiPost(page, "/api/delivery-notes", {
        client_id: client.id, issue_date: "2026-09-02",
        lines: [{ description: "Caméra IP extérieure", quantity: 2, unit: "unit", product_id: product.id }],
      });

      const pages = [
        `invoices/${invoice.body.id}`,
        `quotes/${quote.body.id}`,
        `delivery-notes/${note.body.id}`,
      ];
      for (const route of pages) {
        await page.goto(`/${locale}/${route}`);
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

        // The button is the PDF card's own; its label is translated, so find it
        // by the download icon's own button inside that card.
        const button = page.getByRole("button").filter({ hasText: /PDF/i }).first();
        await expect(button, `${route}: no PDF button`).toBeVisible({ timeout: 15_000 });

        const download = page.waitForEvent("download", { timeout: 60_000 });
        await button.click();
        const file = await download;
        const path = await file.path();
        const size = path ? (await import("node:fs")).statSync(path).size : 0;
        expect(size, `${route}: empty PDF`).toBeGreaterThan(5_000);
        const head = path ? (await import("node:fs")).readFileSync(path).subarray(0, 4).toString() : "";
        expect(head, `${route}: not a PDF`).toBe("%PDF");
      }
      expect(failures, failures.join("\n")).toEqual([]);
    });
  }
});

test.describe("PDF on a phone that cannot save a download", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
  });

  test("the document opens in a tab instead of doing nothing", async ({ page, context }) => {
    test.setTimeout(120_000);
    await signUp(page);
    const client = await setupClient(page, "Client iPhone");
    const quote = await apiPost(page, "/api/quotes", {
      client_id: client.id, issue_date: "2026-09-01", validity_date: "2026-10-01", lines: LINES,
    });

    await page.goto(`/en/quotes/${quote.body.id}`);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    const opened = context.waitForEvent("page", { timeout: 60_000 });
    await page.getByRole("button", { name: /Download PDF/i }).click();
    const tab = await opened;

    // The document is served through a page of its own: a frame holding the
    // file, and a link to it for a browser that refuses even the frame.
    const frame = tab.locator("iframe");
    await expect(frame).toHaveAttribute("src", /^blob:/, { timeout: 60_000 });
    await expect(tab.getByRole("link", { name: "Open the PDF" })).toHaveAttribute("href", /^blob:/);
  });
});
