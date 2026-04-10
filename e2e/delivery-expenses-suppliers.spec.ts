import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, apiPut, apiDelete, setupClient, setupSupplier } from "./api-helpers";

test.describe("Delivery notes", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("create and read delivery note", async ({ page }) => {
    const client = await setupClient(page, "DN Client");

    const res = await apiPost(page, "/api/delivery-notes", {
      client_id: client.id,
      issue_date: "2024-06-01",
      delivery_date: "2024-06-05",
      delivery_address: "123 Delivery St",
      lines: [
        { description: "Item A", quantity: 10, unit: "box" },
        { description: "Item B", quantity: 5, unit: "unit" },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.delivery_note_number).toBeTruthy();
    expect(res.body.status).toBe("DRAFT");
    const lines = res.body.lines as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(2);
  });

  test("update delivery note", async ({ page }) => {
    const client = await setupClient(page, "DN Update Client");

    const dn = await apiPost(page, "/api/delivery-notes", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Original", quantity: 1 }],
    });

    const updated = await apiPut(page, `/api/delivery-notes/${dn.body.id}`, {
      client_id: client.id,
      status: "DRAFT",
      issue_date: "2024-06-01",
      delivery_address: "Updated Address",
      lines: [{ description: "Updated Item", quantity: 20 }],
    });

    expect(updated.status).toBe(200);
    expect(updated.body.delivery_address).toBe("Updated Address");
  });

  test("delete delivery note", async ({ page }) => {
    const client = await setupClient(page, "DN Delete Client");

    const dn = await apiPost(page, "/api/delivery-notes", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Temp", quantity: 1 }],
    });

    const del = await apiDelete(page, `/api/delivery-notes/${dn.body.id}`);
    expect(del.status).toBe(204);
  });

  test("sequential delivery note numbers", async ({ page }) => {
    const client = await setupClient(page, "DN Numbering Client");

    const dn1 = await apiPost(page, "/api/delivery-notes", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "DN1", quantity: 1 }],
    });

    const dn2 = await apiPost(page, "/api/delivery-notes", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "DN2", quantity: 1 }],
    });

    expect(dn1.body.delivery_note_number).not.toBe(dn2.body.delivery_note_number);
  });
});

test.describe("Expenses", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("create, read, update, delete expense", async ({ page }) => {
    // Create
    const res = await apiPost(page, "/api/expenses", {
      name: "Office Supplies",
      amount: 250,
      date: "2024-06-01",
      notes: "Printer paper and ink",
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Office Supplies");
    expect(res.body.amount).toBe(250);

    // Read list
    const list = await apiGet(page, "/api/expenses");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);

    // Update
    const updated = await apiPut(page, `/api/expenses/${res.body.id}`, {
      name: "Updated Supplies",
      amount: 300,
      date: "2024-06-15",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Updated Supplies");
    expect(updated.body.amount).toBe(300);

    // Delete
    const del = await apiDelete(page, `/api/expenses/${res.body.id}`);
    expect(del.status).toBe(204);
  });
});

test.describe("Suppliers", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("create, read, update, delete supplier", async ({ page }) => {
    // Create
    const supplier = await setupSupplier(page, "Test Supplier");
    expect(supplier.id).toBeTruthy();
    expect(supplier.name).toBe("Test Supplier");

    // Read list
    const list = await apiGet(page, "/api/suppliers");
    expect(list.status).toBe(200);

    // Read single
    const single = await apiGet(page, `/api/suppliers/${supplier.id}`);
    expect(single.status).toBe(200);
    expect(single.body.name).toBe("Test Supplier");

    // Update
    const updated = await apiPut(page, `/api/suppliers/${supplier.id}`, {
      name: "Updated Supplier",
      email: "supplier@example.com",
      phone: "+213 555 0000",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Updated Supplier");

    // Delete
    const del = await apiDelete(page, `/api/suppliers/${supplier.id}`);
    expect(del.status).toBe(204);

    // Verify gone
    const gone = await apiGet(page, `/api/suppliers/${supplier.id}`);
    expect(gone.status).toBe(404);
  });

  test("create supplier with all fields", async ({ page }) => {
    const res = await apiPost(page, "/api/suppliers", {
      name: "Full Supplier",
      email: "full@supplier.com",
      phone: "+213 555 1111",
      address: "456 Supplier Ave",
      notes: "Primary parts supplier",
    });
    expect(res.status).toBe(200);
    expect(res.body.address).toBe("456 Supplier Ave");
  });
});
