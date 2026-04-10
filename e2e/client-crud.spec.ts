import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiGet, apiPost, apiPut, apiDelete, setupClient } from "./api-helpers";

test.describe("Client CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("create, read, update, delete a client", async ({ page }) => {
    // Create
    const created = await setupClient(page, "CRUD Test Client");
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("CRUD Test Client");

    // Read single
    const single = await apiGet(page, `/api/clients/${created.id}`);
    expect(single.status).toBe(200);
    expect(single.body.name).toBe("CRUD Test Client");

    // Read list
    const list = await apiGet(page, "/api/clients");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect((list.body as unknown as Array<Record<string, unknown>>).some((c) => c.id === created.id)).toBe(true);

    // Update
    const updated = await apiPut(page, `/api/clients/${created.id}`, {
      name: "Updated Client",
      email: "updated@example.com",
      phone: "+213 555 9999",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Updated Client");
    expect(updated.body.email).toBe("updated@example.com");

    // Delete
    const deleted = await apiDelete(page, `/api/clients/${created.id}`);
    expect(deleted.status).toBe(204);

    // Verify gone
    const gone = await apiGet(page, `/api/clients/${created.id}`);
    expect(gone.status).toBe(404);
  });

  test("create client with all fields", async ({ page }) => {
    const res = await apiPost(page, "/api/clients", {
      name: "Full Client",
      email: "full@example.com",
      phone: "+213 555 0000",
      address: "123 Main St",
      city: "Algiers",
      postal_code: "16000",
      country: "DZ",
      siret: "12345678901234",
      vat_number: "FR12345678901",
      notes: "Important client",
    });
    expect(res.status).toBe(200);
    expect(res.body.city).toBe("Algiers");
    expect(res.body.postal_code).toBe("16000");
  });

  test("cannot delete client with existing invoices", async ({ page }) => {
    const client = await setupClient(page, "Client With Invoice");

    // Create an invoice for this client
    await apiPost(page, "/api/invoices", {
      client_id: client.id,
      issue_date: "2024-06-01",
      lines: [{ description: "Service", quantity: 1, unit_price: 100, tax_rate: 20 }],
    });

    // Try to delete — should fail with 409
    const del = await apiDelete(page, `/api/clients/${client.id}`);
    expect(del.status).toBe(409);
  });
});
