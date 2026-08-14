import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";
import { apiDelete, apiGet, apiPost, apiPut } from "./api-helpers";

/**
 * Expense headings.
 *
 * The point of the feature is analysis: a flat list of free-text expenses can't
 * answer "how much fuel this year". So the invariants worth guarding are that a
 * heading is created without a separate step, that the same heading is reused
 * rather than duplicated, and that removing one never removes the spending.
 */
type CategoryRow = { id: string; name: string; expense_count: number };
type CategoryReport = {
  total: number;
  categories: { category_id: string | null; category_name: string | null; total_amount: number; share: number }[];
};

const expense = (name: string, amount: number, category?: string) => ({
  name,
  amount,
  date: "2026-05-10",
  ...(category === undefined ? {} : { category_name: category }),
});

test.describe("Expense categories", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
  });

  test("a new account starts with no headings at all", async ({ page }) => {
    // Nothing is seeded: a business that never buys fuel never gets a fuel heading.
    const res = await apiGet(page, "/api/expense-categories");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("filing an expense under a new heading creates it in one request", async ({ page }) => {
    const created = await apiPost(page, "/api/expenses", expense("Plein du fourgon", 6800, "Carburant"));
    expect(created.status).toBe(200);
    expect((created.body.category as { name: string }).name).toBe("Carburant");

    const list = await apiGet(page, "/api/expense-categories");
    const categories = list.body as unknown as CategoryRow[];
    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe("Carburant");
    expect(categories[0].expense_count).toBe(1);
  });

  test("the same heading is reused, not duplicated", async ({ page }) => {
    await apiPost(page, "/api/expenses", expense("Gasoil mars", 5000, "Carburant"));
    // Stray whitespace is the ordinary way a duplicate heading gets created.
    await apiPost(page, "/api/expenses", expense("Gasoil avril", 5200, "  Carburant  "));

    const categories = (await apiGet(page, "/api/expense-categories")).body as unknown as CategoryRow[];
    expect(categories).toHaveLength(1);
    expect(categories[0].expense_count).toBe(2);
  });

  test("an expense can be moved between headings, and unfiled again", async ({ page }) => {
    const created = await apiPost(page, "/api/expenses", expense("Abonnement", 4500, "Téléphone"));
    const id = created.body.id as string;

    const moved = await apiPut(page, `/api/expenses/${id}`, expense("Abonnement", 4500, "Internet"));
    expect(moved.status).toBe(200);
    expect((moved.body.category as { name: string }).name).toBe("Internet");

    const cleared = await apiPut(page, `/api/expenses/${id}`, expense("Abonnement", 4500, ""));
    expect(cleared.status).toBe(200);
    expect(cleared.body.category).toBeNull();
  });

  test("deleting a heading keeps the spending, unfiled", async ({ page }) => {
    const created = await apiPost(page, "/api/expenses", expense("Loyer mai", 45000, "Loyer"));
    const categories = (await apiGet(page, "/api/expense-categories")).body as unknown as CategoryRow[];

    const deleted = await apiDelete(page, `/api/expense-categories/${categories[0].id}`);
    expect(deleted.status).toBe(204);

    // The expense survives; only its label is gone.
    const reread = await apiGet(page, `/api/expenses/${created.body.id}`);
    expect(reread.status).toBe(200);
    expect(reread.body.amount).toBe(45000);
    expect(reread.body.category).toBeNull();
  });

  test("renaming onto an existing heading is refused rather than crashing", async ({ page }) => {
    await apiPost(page, "/api/expenses", expense("A", 100, "Carburant"));
    await apiPost(page, "/api/expenses", expense("B", 100, "Loyer"));
    const categories = (await apiGet(page, "/api/expense-categories")).body as unknown as CategoryRow[];
    const fuel = categories.find((c) => c.name === "Carburant")!;

    const clash = await apiPut(page, `/api/expense-categories/${fuel.id}`, { name: "Loyer" });
    expect(clash.status).toBe(409);

    const renamed = await apiPut(page, `/api/expense-categories/${fuel.id}`, { name: "Gasoil" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Gasoil");
  });

  test("the report breaks spending down by heading and keeps the unfiled bucket", async ({ page }) => {
    await apiPost(page, "/api/expenses", expense("Plein 1", 6000, "Carburant"));
    await apiPost(page, "/api/expenses", expense("Plein 2", 4000, "Carburant"));
    await apiPost(page, "/api/expenses", expense("Loyer", 30000, "Loyer"));
    await apiPost(page, "/api/expenses", expense("Repas client", 2000));

    const res = await apiGet(
      page,
      "/api/reports/expenses-by-category?startDate=2026-01-01&endDate=2026-12-31"
    );
    expect(res.status).toBe(200);
    const report = res.body as unknown as CategoryReport;

    expect(report.total).toBeCloseTo(42000, 2);
    // Biggest first: the report exists to show what dominates.
    expect(report.categories[0].category_name).toBe("Loyer");
    expect(report.categories[0].total_amount).toBeCloseTo(30000, 2);
    expect(report.categories[1].category_name).toBe("Carburant");
    expect(report.categories[1].total_amount).toBeCloseTo(10000, 2);

    // Unfiled spending is a row, not a gap — the parts add up to the whole.
    const unfiled = report.categories.find((c) => c.category_id === null);
    expect(unfiled?.total_amount).toBeCloseTo(2000, 2);
    const sum = report.categories.reduce((s, c) => s + c.total_amount, 0);
    expect(sum).toBeCloseTo(report.total, 2);
    expect(report.categories.reduce((s, c) => s + c.share, 0)).toBeCloseTo(100, 1);
  });

  test("headings do not leak between tenants", async ({ page, browser }) => {
    await apiPost(page, "/api/expenses", expense("Plein", 6000, "Carburant"));
    const mine = (await apiGet(page, "/api/expense-categories")).body as unknown as CategoryRow[];

    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await signUp(otherPage);

    const theirs = await apiGet(otherPage, "/api/expense-categories");
    expect(theirs.body).toEqual([]);

    // Nor can the other tenant reach mine by id.
    const stolen = await apiPut(otherPage, `/api/expense-categories/${mine[0].id}`, { name: "Volé" });
    expect(stolen.status).toBe(404);
    const stolenDelete = await apiDelete(otherPage, `/api/expense-categories/${mine[0].id}`);
    expect(stolenDelete.status).toBe(404);

    await otherContext.close();
  });

  test("an expense cannot be filed under another tenant's heading", async ({ page, browser }) => {
    await apiPost(page, "/api/expenses", expense("Plein", 6000, "Carburant"));
    const mine = (await apiGet(page, "/api/expense-categories")).body as unknown as CategoryRow[];

    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await signUp(otherPage);

    const created = await apiPost(otherPage, "/api/expenses", {
      name: "Tentative",
      amount: 100,
      date: "2026-05-10",
      category_id: mine[0].id,
    });
    // Accepted as an expense, but the foreign heading is dropped rather than used.
    expect(created.status).toBe(200);
    expect(created.body.category).toBeNull();

    await otherContext.close();
  });
});
