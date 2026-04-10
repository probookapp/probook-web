import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, apiPut, apiDelete, setupClient, setupProduct } from "./api-helpers";

test.describe("Invoice workflow", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("create invoice with auto-generated number and correct totals", async ({ page }) => {
    const client = await setupClient(page, "Invoice Client");

    const res = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [
        { description: "Service A", quantity: 2, unit_price: 100, tax_rate: 20 },
        { description: "Service B", quantity: 1, unit_price: 50, tax_rate: 10 },
      ],
    });

    expect(res.status).toBe(200);
    const inv = res.body;
    expect(inv.invoice_number).toBeTruthy();
    expect(inv.status).toBe("DRAFT");

    // Verify totals: line1 = 200 + 40 = 240, line2 = 50 + 5 = 55
    // subtotal = 250, tax = 45, total = 295
    expect(inv.subtotal).toBe(250);
    expect(inv.tax_amount).toBe(45);
    expect(inv.total).toBe(295);
  });

  test("issue invoice sets status and integrity hash", async ({ page }) => {
    const client = await setupClient(page, "Issue Test Client");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Work", quantity: 1, unit_price: 500, tax_rate: 20 }],
    });
    expect(inv.status).toBe(200);

    const issued = await apiPost(page, `/api/invoices/${inv.body.id}/issue`);
    expect(issued.status).toBe(200);
    expect(issued.body.status).toBe("ISSUED");
    expect(issued.body.integrity_hash).toBeTruthy();
    expect(typeof issued.body.integrity_hash).toBe("string");
    expect((issued.body.integrity_hash as string).length).toBe(64); // SHA-256 hex
  });

  test("cannot issue a non-DRAFT invoice", async ({ page }) => {
    const client = await setupClient(page, "Double Issue Client");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Work", quantity: 1, unit_price: 100, tax_rate: 20 }],
    });

    // Issue once
    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    // Try to issue again — should fail
    const second = await apiPost(page, `/api/invoices/${inv.body.id}/issue`);
    expect(second.status).toBe(400);
    expect(second.body.error).toContain("DRAFT");
  });

  test("issuing invoice decrements product stock", async ({ page }) => {
    const client = await setupClient(page, "Stock Test Client");
    const product = await setupProduct(page, "Stock Item", 100, { quantity: 50 });

    // Create invoice with product line
    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [
        {
          product_id: product.id,
          description: "Stock Item",
          quantity: 10,
          unit_price: 100,
          tax_rate: 20,
        },
      ],
    });
    expect(inv.status).toBe(200);

    // Issue the invoice
    const issued = await apiPost(page, `/api/invoices/${inv.body.id}/issue`);
    expect(issued.status).toBe(200);

    // Check product stock decreased from 50 to 40
    const productAfter = await apiGet(page, `/api/products/${product.id}`);
    expect(productAfter.body.quantity).toBe(40);
  });

  test("stock does not go below zero", async ({ page }) => {
    const client = await setupClient(page, "Zero Stock Client");
    const product = await setupProduct(page, "Low Stock Item", 10, { quantity: 3 });

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [
        {
          product_id: product.id,
          description: "Low Stock Item",
          quantity: 10, // more than available
          unit_price: 10,
          tax_rate: 0,
        },
      ],
    });

    await apiPost(page, `/api/invoices/${inv.body.id}/issue`);

    const productAfter = await apiGet(page, `/api/products/${product.id}`);
    expect(productAfter.body.quantity).toBe(0); // clamped to 0, not negative
  });

  test("update invoice recalculates totals", async ({ page }) => {
    const client = await setupClient(page, "Update Totals Client");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Original", quantity: 1, unit_price: 100, tax_rate: 20 }],
    });

    // Update with different lines
    const updated = await apiPut(page, `/api/invoices/${inv.body.id}`, {
      client_id: client.id,
      status: "DRAFT",
      issue_date: "2024-06-01",
      due_date: "2024-07-01",
      lines: [
        { description: "Updated Line", quantity: 5, unit_price: 200, tax_rate: 10 },
      ],
    });

    expect(updated.status).toBe(200);
    // 5 * 200 = 1000 subtotal, 100 tax = 1100 total
    expect(updated.body.subtotal).toBe(1000);
    expect(updated.body.tax_amount).toBe(100);
    expect(updated.body.total).toBe(1100);
  });

  test("delete invoice", async ({ page }) => {
    const client = await setupClient(page, "Delete Invoice Client");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Temp", quantity: 1, unit_price: 10, tax_rate: 0 }],
    });

    const del = await apiDelete(page, `/api/invoices/${inv.body.id}`);
    expect(del.status).toBe(204);

    const gone = await apiGet(page, `/api/invoices/${inv.body.id}`);
    expect(gone.status).toBe(404);
  });

  test("invoice with shipping cost", async ({ page }) => {
    const client = await setupClient(page, "Shipping Client");

    const inv = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      shipping_cost: 50,
      shipping_tax_rate: 20,
      lines: [{ description: "Item", quantity: 1, unit_price: 100, tax_rate: 20 }],
    });

    expect(inv.status).toBe(200);
    // Line: 100 subtotal + 20 tax = 120
    // Shipping: 50 + 10 tax = 60
    // Total: subtotal=150, tax=30, total=180
    expect(inv.body.subtotal).toBe(150);
    expect(inv.body.tax_amount).toBe(30);
    expect(inv.body.total).toBe(180);
  });

  test("sequential invoice numbers", async ({ page }) => {
    const client = await setupClient(page, "Numbering Client");

    const inv1 = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "First", quantity: 1, unit_price: 10, tax_rate: 0 }],
    });

    const inv2 = await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Second", quantity: 1, unit_price: 10, tax_rate: 0 }],
    });

    // Both should have invoice numbers and they should be different
    expect(inv1.body.invoice_number).toBeTruthy();
    expect(inv2.body.invoice_number).toBeTruthy();
    expect(inv1.body.invoice_number).not.toBe(inv2.body.invoice_number);
  });
});
