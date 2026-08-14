import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { setupClient, setupProduct, setupIssuedInvoice } from "./api-helpers";

/**
 * Not an assertion — a printer.
 *
 * Downloads a real invoice PDF so two typographic settings can be compared as
 * documents rather than as a diff. Judging a typeface from a stylesheet is
 * guesswork; the point of a PDF is what it looks like on paper.
 *
 * Inert unless asked for:
 *   PDF_PREVIEW=facture-helvetica npx playwright test pdf-typography
 */
const NAME = process.env.PDF_PREVIEW;

test.describe("PDF typography preview", () => {
  test.skip(!NAME, "set PDF_PREVIEW=<file name> to print a sample invoice");
  test.describe.configure({ timeout: 300_000 });

  test("print a sample invoice", async ({ page }) => {
    // A font that fails to load makes the PDF button do nothing at all, with the
    // reason visible only in the console — so it is surfaced here.
    page.on("console", (m) => {
      if (m.type() === "error") console.log("[browser]", m.text());
    });
    page.on("pageerror", (e) => console.log("[pageerror]", e.message));
    page.on("requestfailed", (r) => console.log("[reqfail]", r.url().slice(0, 90), r.failure()?.errorText));
    page.on("response", (r) => {
      if (r.status() >= 400 && r.url().includes("/fonts/"))
        console.log("[font]", r.status(), r.url().slice(0, 90));
    });
    await signUp(page);

    const client = await setupClient(page, "SARL Atlas Distribution");
    const tv = await setupProduct(page, 'Téléviseur LED 43" Condor', 42000, {
      tax_rate: 19,
      purchase_price: 33000,
    });
    const cable = await setupProduct(page, "Câble HDMI 2.1 - 2 m", 1800, {
      tax_rate: 19,
      purchase_price: 950,
    });

    // Enough lines, and enough digits, to judge how figures column up.
    const invoice = await setupIssuedInvoice(page, {
      client_id: client.id,
      issue_date: "2026-08-03",
      due_date: "2026-09-02",
      lines: [
        { description: 'Téléviseur LED 43" Condor', quantity: 3, unit_price: 42000, tax_rate: 19, product_id: tv.id },
        { description: "Câble HDMI 2.1 - 2 m", quantity: 12, unit_price: 1800, tax_rate: 19, product_id: cable.id },
        { description: "Installation & mise en service à domicile", quantity: 2, unit_price: 5000, tax_rate: 19 },
      ],
      discount_percent: 5,
    });

    await page.goto(`/fr/invoices/${invoice.body.id}`);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

    await page.screenshot({ path: `comparaison-pdf/${NAME}-ecran.png` });

    const download = page.waitForEvent("download", { timeout: 120_000 });
    await page.getByRole("button", { name: "Télécharger PDF" }).click();
    const file = await download;
    await file.saveAs(`comparaison-pdf/${NAME}.pdf`);

    expect(await file.failure()).toBeNull();
  });
});
