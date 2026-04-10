import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, setupClient, setupProduct, setupSupplier } from "./api-helpers";

test.describe("Batch delete operations", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("batch delete clients", async ({ page }) => {
    const c1 = await setupClient(page, "Batch Client 1");
    const c2 = await setupClient(page, "Batch Client 2");
    const c3 = await setupClient(page, "Batch Client 3");

    const res = await apiPost(page, "/api/clients/batch-delete", [c1.id, c2.id]);
    expect(res.status).toBe(200);

    // c1 and c2 should be gone, c3 remains
    const list = await apiGet(page, "/api/clients");
    const ids = (list.body as unknown as Array<Record<string, unknown>>).map((c) => c.id);
    expect(ids).not.toContain(c1.id);
    expect(ids).not.toContain(c2.id);
    expect(ids).toContain(c3.id);
  });

  test("batch delete products", async ({ page }) => {
    const p1 = await setupProduct(page, "Batch Product 1", 10);
    const p2 = await setupProduct(page, "Batch Product 2", 20);

    const res = await apiPost(page, "/api/products/batch-delete", [p1.id, p2.id]);
    expect(res.status).toBe(200);

    const list = await apiGet(page, "/api/products");
    const ids = (list.body as unknown as Array<Record<string, unknown>>).map((p) => p.id);
    expect(ids).not.toContain(p1.id);
    expect(ids).not.toContain(p2.id);
  });

  test("batch delete suppliers", async ({ page }) => {
    const s1 = await setupSupplier(page, "Batch Supplier 1");
    const s2 = await setupSupplier(page, "Batch Supplier 2");

    const res = await apiPost(page, "/api/suppliers/batch-delete", [s1.id, s2.id]);
    expect(res.status).toBe(200);

    const list = await apiGet(page, "/api/suppliers");
    const ids = (list.body as unknown as Array<Record<string, unknown>>).map((s) => s.id);
    expect(ids).not.toContain(s1.id);
    expect(ids).not.toContain(s2.id);
  });

  test("batch delete with empty array fails validation", async ({ page }) => {
    const res = await apiPost(page, "/api/clients/batch-delete", []);
    expect(res.status).toBe(400);
  });
});
