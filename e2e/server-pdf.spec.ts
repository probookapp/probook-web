import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { setupClient, setupProduct, setupIssuedInvoice } from "./api-helpers";

/**
 * The server-rendered document.
 *
 * The browser cannot embed a font here: fontkit is compiled to WebAssembly and
 * fetches it through a `data:` URL the CSP refuses, and production's
 * `script-src` carries no `wasm-unsafe-eval`. Node has neither obstacle, which
 * is what lets an Arabic invoice exist at all — Helvetica has no Arabic glyphs,
 * and pdfkit prints a truncated byte rather than refusing, so an Arabic invoice
 * came out reading "A5HD'" where "الوصف" belonged.
 *
 * The route is a Pages Router handler on purpose: an App Router one resolves
 * `react` to Next's server build, whose `createContext` @react-pdf needs and
 * does not find.
 */
test("an invoice renders to a pdf on the server, in french and in arabic", async ({ page }) => {
  await signUp(page);

  const client = await setupClient(page, "SARL Atlas Distribution");
  const tv = await setupProduct(page, 'Téléviseur LED 43" Condor', 42000, {
    tax_rate: 19,
    purchase_price: 33000,
  });
  const invoice = await setupIssuedInvoice(page, {
    client_id: client.id,
    issue_date: "2026-08-03",
    due_date: "2026-09-02",
    lines: [
      {
        description: 'Téléviseur LED 43" Condor',
        quantity: 3,
        unit_price: 42000,
        tax_rate: 19,
        product_id: tv.id,
      },
    ],
  });

  for (const locale of ["fr", "ar"]) {
    const res = await page.request.get(
      `/api/documents/invoice/${invoice.body.id}?locale=${locale}`
    );
    expect(res.status(), `${locale} status`).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");

    const body = await res.body();
    expect(body.subarray(0, 5).toString("latin1"), `${locale} header`).toBe("%PDF-");
    // An embedded face makes the file substantially larger than a base-14 one;
    // this also fails if font registration silently did nothing.
    expect(body.length, `${locale} size`).toBeGreaterThan(20_000);

    // Written out on request, because whether Arabic *reads* correctly —
    // letters joined, order right — is a thing only eyes can settle.
    if (process.env.PDF_PREVIEW) {
      const { writeFileSync, mkdirSync } = await import("fs");
      mkdirSync("comparaison-pdf", { recursive: true });
      writeFileSync(`comparaison-pdf/serveur-${locale}.pdf`, body);
    }
  }

  // Tenant isolation: an id from another account is not found, not rendered.
  const other = await page.context().browser()!.newContext();
  const otherPage = await other.newPage();
  await signUp(otherPage);
  const stolen = await otherPage.request.get(`/api/documents/invoice/${invoice.body.id}`);
  expect(stolen.status()).toBe(404);
  await other.close();
});
