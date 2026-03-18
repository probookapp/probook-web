import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

test.describe("API input validation", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("POST /api/clients rejects empty name", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Validation failed");
  });

  test("POST /api/clients rejects invalid email", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", email: "not-an-email" }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Validation failed");
  });

  test("POST /api/clients accepts valid data", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Valid Client",
          email: "valid@example.com",
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body.name).toBe("Valid Client");
  });

  test("POST /api/products rejects negative price", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designation: "Test Product",
          unit_price: -10,
          tax_rate: 20,
          unit: "unit",
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Validation failed");
  });

  test("POST /api/products rejects tax_rate > 100", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designation: "Test Product",
          unit_price: 10,
          tax_rate: 150,
          unit: "unit",
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Validation failed");
  });

  test("POST /api/invoices rejects missing lines", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "fake-id",
          issue_date: "2024-01-01",
          lines: [],
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Validation failed");
  });

  test("POST /api/invoices rejects missing client_id", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue_date: "2024-01-01",
          lines: [
            {
              description: "Test line",
              quantity: 1,
              unit_price: 100,
              tax_rate: 20,
            },
          ],
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Validation failed");
  });

  test("POST /api/payments rejects zero amount", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: "fake-id",
          amount: 0,
          payment_date: "2024-01-01",
          payment_method: "CASH",
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Validation failed");
  });

  test("POST /api/expenses rejects missing name", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 100,
          date: "2024-01-01",
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Validation failed");
  });

  test("POST /api/pos/transactions rejects missing payments", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/pos/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          register_id: "fake",
          session_id: "fake",
          lines: [
            {
              designation: "Item",
              quantity: 1,
              unit_price: 10,
            },
          ],
          payments: [],
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Validation failed");
  });

  test("POST /api/pos/cash-movements rejects invalid movement_type", async ({
    page,
  }) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/pos/cash-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "fake",
          movement_type: "INVALID",
          amount: 100,
          reason: "test",
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Validation failed");
  });

  test("rejects invalid JSON body", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{{{",
      });
      return { status: r.status, body: await r.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Invalid JSON body");
  });
});
