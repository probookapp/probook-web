import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupClient, setupProduct } from "./api-helpers";

test.describe("Document conversions", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("duplicate quote preserves lines and totals", async ({ page }) => {
    const client = await setupClient(page, "Dup Quote Client");

    const quote = await apiPost(page, "/api/quotes", {
      client_id: client.id,
      issue_date: "2024-06-01",
      validity_date: "2024-07-01",
      lines: [
        { description: "Consulting", quantity: 5, unit_price: 200, tax_rate: 20 },
        { description: "License", quantity: 1, unit_price: 1000, tax_rate: 0 },
      ],
    });
    expect(quote.status).toBe(200);

    // Duplicate
    const dup = await apiPost(page, `/api/quotes/${quote.body.id}/duplicate`);
    expect(dup.status).toBe(200);
    expect(dup.body.id).not.toBe(quote.body.id);
    expect(dup.body.quote_number).not.toBe(quote.body.quote_number);
    expect(dup.body.status).toBe("DRAFT");
    expect(dup.body.subtotal).toBe(quote.body.subtotal);
    expect(dup.body.total).toBe(quote.body.total);

    const lines = dup.body.lines as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(2);
  });

  test("create invoice from delivery notes", async ({ page }) => {
    const client = await setupClient(page, "DN to INV Client");
    const product = await setupProduct(page, "DN Product", 100, { quantity: 50 });

    // Create 2 delivery notes for the same client
    const dn1 = await apiPost(page, "/api/delivery-notes", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [
        { product_id: product.id, description: "DN Product", quantity: 3 },
      ],
    });
    const dn2 = await apiPost(page, "/api/delivery-notes", {
      client_id: client.id,
      issue_date: "2024-06-02",
      lines: [
        { product_id: product.id, description: "DN Product", quantity: 7 },
      ],
    });

    // Convert to invoice
    const inv = await apiPost(page, "/api/invoices/from-delivery-notes", {
      delivery_note_ids: [dn1.body.id, dn2.body.id],
    });

    expect(inv.status).toBe(200);
    expect(inv.body.invoice_number).toBeTruthy();
    expect(inv.body.status).toBe("DRAFT");
    expect(inv.body.client_id).toBe(client.id);

    const lines = inv.body.lines as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(2);
    // Lines should use product pricing
    expect(lines[0].unit_price).toBe(100);
    expect(lines[1].unit_price).toBe(100);
  });

  test("invoice from delivery notes rejects different clients", async ({ page }) => {
    const client1 = await setupClient(page, "DN Client 1");
    const client2 = await setupClient(page, "DN Client 2");

    const dn1 = await apiPost(page, "/api/delivery-notes", {
      client_id: client1.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Item", quantity: 1 }],
    });
    const dn2 = await apiPost(page, "/api/delivery-notes", {
      client_id: client2.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Item", quantity: 1 }],
    });

    const res = await apiPost(page, "/api/invoices/from-delivery-notes", {
      delivery_note_ids: [dn1.body.id, dn2.body.id],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("same client");
  });
});
