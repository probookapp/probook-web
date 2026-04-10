import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupClient, setupProduct, setupSupplier } from "./api-helpers";

test.describe("Product categories", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("create and list categories", async ({ page }) => {
    const cat = await apiPost(page, "/api/categories", { name: "Electronics" });
    expect(cat.status).toBe(200);
    expect(cat.body.name).toBe("Electronics");

    const list = await apiGet(page, "/api/categories");
    expect(list.status).toBe(200);
    expect((list.body as unknown as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test("create subcategory with parent", async ({ page }) => {
    const parent = await apiPost(page, "/api/categories", { name: "Clothing" });
    const child = await apiPost(page, "/api/categories", {
      name: "Shirts",
      parent_id: parent.body.id,
    });

    expect(child.status).toBe(200);
    expect(child.body.parent_id).toBe(parent.body.id);
  });

  test("create product with category", async ({ page }) => {
    const cat = await apiPost(page, "/api/categories", { name: "Food" });
    const product = await setupProduct(page, "Pasta", 5, { category_id: cat.body.id });
    expect(product.category_id).toBe(cat.body.id);
  });
});

test.describe("Client contacts", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("create and list contacts", async ({ page }) => {
    const client = await setupClient(page, "Contact Client");

    const contact = await apiPost(page, "/api/contacts", {
      client_id: client.id,
      name: "Jane Smith",
      role: "CEO",
      email: "jane@example.com",
      phone: "+213 555 1234",
      is_primary: true,
    });
    expect(contact.status).toBe(200);
    expect(contact.body.name).toBe("Jane Smith");
    expect(contact.body.is_primary).toBe(true);

    const list = await apiGet(page, "/api/contacts");
    expect(list.status).toBe(200);
    expect((list.body as unknown as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Product-supplier links", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("link product to supplier", async ({ page }) => {
    const product = await setupProduct(page, "Linked Product", 100);
    const supplier = await setupSupplier(page, "Linked Supplier");

    const link = await apiPost(page, "/api/product-suppliers", {
      product_id: product.id,
      supplier_id: supplier.id,
      purchase_price: 60,
    });
    expect(link.status).toBe(200);
    expect(link.body.purchase_price).toBe(60);

    const list = await apiGet(page, "/api/product-suppliers");
    expect(list.status).toBe(200);
    expect((list.body as unknown as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
});
