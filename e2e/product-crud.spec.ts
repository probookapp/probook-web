import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, apiPut, apiDelete, setupProduct } from "./api-helpers";

test.describe("Product CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("create, read, update, delete a product", async ({ page }) => {
    // Create
    const created = await setupProduct(page, "Widget A", 99.99);
    expect(created.id).toBeTruthy();
    expect(created.designation).toBe("Widget A");
    expect(created.unit_price).toBe(99.99);

    // Read single
    const single = await apiGet(page, `/api/products/${created.id}`);
    expect(single.status).toBe(200);
    expect(single.body.designation).toBe("Widget A");

    // Read list
    const list = await apiGet(page, "/api/products");
    expect(list.status).toBe(200);

    // Update
    const updated = await apiPut(page, `/api/products/${created.id}`, {
      designation: "Widget A v2",
      unit_price: 120,
      tax_rate: 19,
      unit: "piece",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.designation).toBe("Widget A v2");
    expect(updated.body.unit_price).toBe(120);

    // Delete
    const deleted = await apiDelete(page, `/api/products/${created.id}`);
    expect(deleted.status).toBe(204);

    // Verify gone
    const gone = await apiGet(page, `/api/products/${created.id}`);
    expect(gone.status).toBe(404);
  });

  test("create product with initial stock", async ({ page }) => {
    const product = await setupProduct(page, "Stocked Item", 50, { quantity: 100 });
    expect(product.quantity).toBe(100);
  });

  test("create product with custom prices", async ({ page }) => {
    const res = await apiPost(page, "/api/products", {
      designation: "Multi-Price Item",
      unit_price: 100,
      tax_rate: 20,
      unit: "unit",
      prices: [
        { label: "Wholesale", price: 80 },
        { label: "VIP", price: 70 },
      ],
    });
    expect(res.status).toBe(200);
    const prices = res.body.prices as Array<Record<string, unknown>>;
    expect(prices).toHaveLength(2);
    expect(prices.some((p) => p.label === "Wholesale" && p.price === 80)).toBe(true);
  });

  test("create service product", async ({ page }) => {
    const product = await setupProduct(page, "Consulting", 150, { is_service: true });
    expect(product.is_service).toBe(true);
  });
});
