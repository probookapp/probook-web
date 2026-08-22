import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupClient, setupProduct } from "./api-helpers";

/**
 * Stock follows the document, fractions included.
 *
 * The catalogue offers kg, m, m², m³ and litre, and the till accepts 0.01 steps
 * for them — but every stock write went through `Math.round`. Selling 0.4 m
 * decremented nothing; selling 2.6 m removed 3. Six products in production are
 * sold by the metre, so this was drifting for real.
 *
 * The rounding was silent, which is what made it expensive: the sale succeeded,
 * the invoice was right, the money was right, and only the shelf disagreed.
 */
test.describe("fractional quantities", () => {
  test("selling half a metre removes half a metre", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Câblage Client");
    const product = await setupProduct(page, "Câble au mètre", 500, {
      quantity: 100,
      unit: "m",
    });

    const invoice = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: new Date().toISOString().slice(0, 10),
      lines: [
        {
          product_id: product.id,
          description: "Câble",
          quantity: 2.5,
          unit_price: 500,
          tax_rate: 19,
        },
      ],
    });
    expect(invoice.status).toBe(200);
    // Issuing is what touches stock; a draft never does.
    const issued = await apiPost(page, `/api/invoices/${invoice.body.id}/issue`);
    expect(issued.status).toBe(200);

    const after = await apiGet(page, `/api/products/${product.id}`);
    expect(after.status).toBe(200);
    expect(
      after.body.quantity,
      "100 m less 2.5 m sold is 97.5 m — rounding it to 97 loses half a metre a sale"
    ).toBeCloseTo(97.5, 3);
  });

  test("a quantity under one unit still leaves the shelf", async ({ page }) => {
    await signUp(page);
    const client = await setupClient(page, "Petit Métrage");
    const product = await setupProduct(page, "Gaine au mètre", 300, {
      quantity: 10,
      unit: "m",
    });

    const invoice = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: new Date().toISOString().slice(0, 10),
      lines: [
        {
          product_id: product.id,
          description: "Gaine",
          quantity: 0.4,
          unit_price: 300,
          tax_rate: 19,
        },
      ],
    });
    await apiPost(page, `/api/invoices/${invoice.body.id}/issue`);

    const after = await apiGet(page, `/api/products/${product.id}`);
    expect(
      after.body.quantity,
      "0.4 m used to round to 0: the sale went through and the stock never moved"
    ).toBeCloseTo(9.6, 3);
  });
});
