import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { signUp } from "./helpers";
import {
  apiPost,
  apiPut,
  setupClient,
  setupProduct,
  setupSupplier,
  setupIssuedInvoice,
} from "./api-helpers";
import { setupPlatformAdmin, adminGet } from "./admin-helpers";

/**
 * Every dialog of the application, opened on data built to break layouts, and
 * measured at four widths.
 *
 * A dialog that holds up with "Caméra IP" and 24 500 DZD can still fall apart on
 * a real account: an unbroken 75-letter company name, a reference code, an
 * amount in the billions, thirty lines to receive. Nothing of that shows on a
 * developer's screen, so the dialogs are not listed here by hand — a list kept
 * by hand is the one that forgets the dialog added last month. Each page is
 * swept instead: every button it shows, and every item of its first row's "⋯"
 * menu, is clicked from a fresh load, and whatever dialog opens is measured.
 *
 * A dialog fails when, at any of the widths:
 *  - it is wider than the screen, or scrolls sideways itself;
 *  - an element inside it sticks out of it — out of the dialog, not out of a
 *    deliberately clipped (truncate) or scrolling (table) container;
 *  - a block's own text spills out of its box (a word wider than its column);
 *  - the first dropdown it holds opens partly off-screen.
 * Inner horizontal scrollers (a wide table in a dialog) are reported apart, as
 * notes: legitimate, but worth seeing.
 *
 * The till is not swept: its dialogs open from a filled basket and an open
 * session, which clicking buttons from a fresh load cannot reach.
 */

const WIDTHS = [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
];

// Built to break things: no space to wrap on, and as many digits as an
// amount in dinars can plausibly carry.
const LONG_WORD = "Établissementsinternationauxdedistributiondematérielélectroniqueetdesécurité";
const LONG_NAME = `${LONG_WORD} — Société à responsabilité limitée de la wilaya d'Alger`;
const LONG_EMAIL = `service.comptabilite.fournisseurs.${"x".repeat(24)}@${"distribution".repeat(3)}.dz`;
const LONG_REF = `REF-${"A1B2C3D4E5".repeat(4)}`;
const BIG_PRICE = 987654321.99;
const BIG_QTY = 99999;
// Per document line: nine units at the big price, thirty lines — a total in
// the hundreds of billions, within the 13 integer digits money columns hold.
const LINE_QTY = 9;

/** Buttons that act at once instead of opening something — never clicked. */
const DO_NOT_CLICK =
  /log ?out|sign ?out|duplicate|convert|mark as|create invoice|create delivery|issue|archive|restore|download|pdf|print|export|subscribe|refresh|whatsapp|copy|accept|refuse|reject|install|update now|reload|back|^$/i;

interface Finding {
  page: string;
  trigger: string;
  dialog: string;
  width: number;
  problem: string;
}

async function seed(page: Page) {
  const ok = (res: { status: number; body?: unknown }, what: string) =>
    expect(res.status, `seeding ${what}: ${JSON.stringify(res.body).slice(0, 300)}`).toBeLessThan(300);

  const client = await setupClient(page, LONG_NAME);
  ok(
    await apiPut(page, `/api/clients/${client.id}`, {
      name: LONG_NAME,
      email: LONG_EMAIL,
      phone: "+213 (0) 555 12 34 56 78 90 poste 1234",
      address: `${LONG_WORD}, zone industrielle de Oued Smar, lot n° 1234567890, 16000 Alger`,
      city: LONG_WORD,
    }),
    "client"
  );
  ok(await apiPost(page, "/api/contacts", { client_id: client.id, name: LONG_NAME, email: LONG_EMAIL, phone: "+213 555 12 34 56" }), "contact");

  const supplier = await setupSupplier(page, LONG_NAME);
  ok(
    await apiPut(page, `/api/suppliers/${supplier.id}`, {
      name: LONG_NAME,
      email: LONG_EMAIL,
      phone: "+213 (0) 555 12 34 56 78 90",
      address: `${LONG_WORD}, 16000 Alger`,
    }),
    "supplier"
  );

  const product = await setupProduct(page, `Caméra ${LONG_WORD} 4K`, BIG_PRICE, {
    reference: LONG_REF,
    purchase_price: BIG_PRICE - 1000,
    quantity: BIG_QTY,
    tax_rate: 19,
    description: `${LONG_WORD} `.repeat(6),
  });
  const variantProduct = await setupProduct(page, `Câble ${LONG_WORD}`, BIG_PRICE, {
    reference: `${LONG_REF}-V`,
    has_variants: true,
    quantity: 0,
    tax_rate: 19,
  });
  for (const name of [`${LONG_WORD} rouge`, `${LONG_WORD} bleu`]) {
    ok(
      await apiPost(page, `/api/products/${variantProduct.id}/variants`, {
        name,
        sku: `${LONG_REF}-${name.length}`,
        attributes: { couleur: LONG_WORD },
        quantity: BIG_QTY,
      }),
      "variant"
    );
  }
  // Enough products that pickers and lists have something to scroll.
  for (let i = 0; i < 6; i++) {
    await setupProduct(page, `${LONG_WORD} n°${i}`, BIG_PRICE, { quantity: BIG_QTY, reference: `${LONG_REF}${i}` });
  }

  ok(await apiPost(page, "/api/categories", { name: LONG_NAME }), "category");
  ok(await apiPost(page, "/api/tags", { name: LONG_WORD.slice(0, 30), color: "blue" }), "tag");
  const location = await apiPost(page, "/api/locations", { name: LONG_NAME, type: "warehouse", address: LONG_NAME });
  ok(location, "location");

  const thirtyLines = Array.from({ length: 30 }, (_, i) => ({
    product_id: product.id,
    description: `${LONG_WORD} ${i}`,
    quantity: LINE_QTY,
    unit_price: BIG_PRICE,
    tax_rate: 19,
  }));

  const invoice = await setupIssuedInvoice(page, {
    client_id: client.id,
    issue_date: "2026-10-01",
    lines: thirtyLines.map(({ description, quantity, unit_price, tax_rate }) => ({ description, quantity, unit_price, tax_rate })),
  });
  ok(invoice, "invoice");
  ok(
    await apiPost(page, "/api/payments", {
      invoice_id: invoice.body.id,
      amount: 123456789.12,
      payment_date: "2026-10-02",
      payment_method: "BANK_TRANSFER",
      reference: LONG_REF,
    }),
    "payment"
  );

  ok(
    await apiPost(page, "/api/credit-notes", {
      client_id: client.id,
      invoice_id: invoice.body.id,
      issue_date: "2026-10-04",
      reason: LONG_NAME,
      restock: false,
      lines: [{ description: LONG_WORD, quantity: 1, unit_price: BIG_PRICE, tax_rate: 19 }],
    }),
    "credit note"
  );

  const quote = await apiPost(page, "/api/quotes", {
    client_id: client.id,
    issue_date: "2026-10-01",
    validity_date: "2026-11-01",
    lines: thirtyLines.map(({ description, quantity, unit_price, tax_rate }) => ({ description, quantity, unit_price, tax_rate })),
  });
  ok(quote, "quote");

  const note = await apiPost(page, "/api/delivery-notes", {
    client_id: client.id,
    issue_date: "2026-10-01",
    delivery_address: LONG_NAME,
    lines: thirtyLines.slice(0, 10).map((l) => ({ product_id: l.product_id, description: l.description, quantity: 1 })),
  });
  ok(note, "delivery note");

  const order = await apiPost(page, "/api/purchases", {
    supplier_id: supplier.id,
    notes: LONG_NAME,
    lines: thirtyLines.map((l) => ({ product_id: l.product_id, quantity: LINE_QTY, unit_price: BIG_PRICE, tax_rate: 19 })),
  });
  ok(order, "purchase order");

  ok(
    await apiPost(page, "/api/expenses", {
      name: LONG_NAME,
      amount: BIG_PRICE,
      date: "2026-10-03",
      category_name: LONG_WORD.slice(0, 60),
    }),
    "expense"
  );

  const transfer = await apiPost(page, "/api/stock-transfers", {
    from_location_id: (await defaultLocationId(page)) as string,
    to_location_id: location.body.id,
    notes: LONG_NAME,
    lines: [{ product_id: product.id, quantity: 5 }],
  });
  ok(transfer, "stock transfer");

  return {
    invoiceId: invoice.body.id as string,
    quoteId: quote.body.id as string,
    noteId: note.body.id as string,
    orderId: order.body.id as string,
    transferId: transfer.body.id as string,
  };
}

async function defaultLocationId(page: Page) {
  const res = await page.request.get("/api/locations");
  const list = (await res.json()) as Array<{ id: string; is_default: boolean }>;
  return list.find((l) => l.is_default)?.id;
}

/** Everything wrong with the open dialog at the current width, as sentences. */
async function measure(dialog: Locator): Promise<{ problems: string[]; notes: string[] }> {
  return dialog.evaluate(
    (root) => {
    const problems: string[] = [];
    const notes: string[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const describe = (el: Element) => {
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50);
      const cls = (el.getAttribute("class") ?? "").split(" ").slice(0, 4).join(".");
      return `<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}>${text ? ` "${text}"` : ""}`;
    };

    const box = root.getBoundingClientRect();
    if (box.left < -1 || box.right > vw + 1) problems.push(`dialog ${Math.round(box.width)}px wide on a ${vw}px screen`);
    if (box.top < -1 || box.bottom > vh + 1) problems.push(`dialog runs off the screen vertically`);
    if (root.scrollWidth > root.clientWidth + 1)
      problems.push(`dialog scrolls sideways by ${root.scrollWidth - root.clientWidth}px`);

    // The nearest ancestor that clips or scrolls sideways decides whether an
    // element sticking out is a fault (it is the dialog itself) or intended.
    const clipOf = (el: Element): Element => {
      let node = el.parentElement;
      while (node && node !== root) {
        const ox = getComputedStyle(node).overflowX;
        if (ox !== "visible") return node;
        node = node.parentElement;
      }
      return root;
    };

    const reported = new Set<Element>();
    for (const el of root.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.position === "fixed") continue;

      const clip = clipOf(el);
      const c = clip.getBoundingClientRect();
      const out = Math.max(c.left - r.left, r.right - c.right);
      if (out > 1) {
        // Report the outermost offender only, not every child it drags along.
        let parent = el.parentElement;
        let ancestorReported = false;
        while (parent && parent !== root) {
          if (reported.has(parent)) { ancestorReported = true; break; }
          parent = parent.parentElement;
        }
        if (!ancestorReported) {
          reported.add(el);
          const ox = getComputedStyle(clip).overflowX;
          if (clip === root) problems.push(`${describe(el)} sticks out of the dialog by ${Math.round(out)}px`);
          else if (ox === "auto" || ox === "scroll") notes.push(`${describe(clip)} scrolls sideways (${Math.round(out)}px)`);
        }
      }

      // A block whose own text is wider than it, with nothing to clip it.
      if (
        style.overflowX === "visible" &&
        style.display !== "inline" &&
        el.clientWidth > 0 &&
        el.scrollWidth > el.clientWidth + 1 &&
        [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
      ) {
        problems.push(`${describe(el)} text spills out of its box by ${el.scrollWidth - el.clientWidth}px`);
      }
    }
    return { problems: [...new Set(problems)], notes: [...new Set(notes)] };
    },
    undefined,
    { timeout: 10_000 }
  );
}

/** The first dropdown of the dialog, opened: does its list stay on screen? */
async function measureDropdown(page: Page, dialog: Locator): Promise<string[]> {
  const trigger = dialog.locator('[aria-haspopup="listbox"]').filter({ visible: true }).first();
  if (!(await trigger.count())) return [];
  await trigger.click().catch(() => {});
  await page.waitForTimeout(300);
  const problems = await page.evaluate(() => {
    const list = document.querySelector('[role="listbox"]');
    if (!list) return [];
    const r = list.getBoundingClientRect();
    const out: string[] = [];
    if (r.left < -1 || r.right > window.innerWidth + 1) out.push(`dropdown list overflows the screen sideways`);
    if (list.scrollWidth > list.clientWidth + 1) out.push(`dropdown list scrolls sideways`);
    return out;
  });
  await page.keyboard.press("Escape");
  return problems;
}

/**
 * Where a page's own buttons live: <main> in the application shell; the till
 * and the admin console have no shell, so the whole body — the sidebar, the
 * only thing outside <main> elsewhere, holds links, not buttons.
 */
async function rootOf(page: Page): Promise<Locator> {
  return (await page.locator("main").count()) ? page.locator("main") : page.locator("body");
}

/** Buttons worth clicking on a page, and the "⋯" menu items of its first row. */
async function candidates(page: Page): Promise<Array<{ kind: "button" | "menu"; name: string }>> {
  const root = await rootOf(page);
  const names = await root.locator("button").filter({ visible: true }).evaluateAll((buttons) =>
    buttons
      .filter((b) => !b.closest('[role="dialog"], [role="row"], li, [data-list-card], nav, aside, header'))
      .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().replace(/\s+/g, " "))
  );
  const found: Array<{ kind: "button" | "menu"; name: string }> = [];
  for (const name of new Set(names)) if (!DO_NOT_CLICK.test(name)) found.push({ kind: "button", name });

  const more = page.getByRole("row").nth(1).getByRole("button", { name: "More actions" });
  if (await more.count()) {
    await more.click();
    const items = await page.getByRole("menuitem").allInnerTexts();
    await page.keyboard.press("Escape");
    for (const name of items.map((s) => s.trim())) if (!DO_NOT_CLICK.test(name)) found.push({ kind: "menu", name });
  }
  // The row's inline icon buttons (its primary action).
  const inline = await page
    .getByRole("row")
    .nth(1)
    .getByRole("button")
    .evaluateAll((bs) => bs.map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()));
  for (const name of inline) if (name !== "More actions" && !DO_NOT_CLICK.test(name)) found.push({ kind: "menu", name: `row:${name}` });
  return found;
}

async function open(page: Page, route: string, at = WIDTHS[0]) {
  await page.setViewportSize(at);
  await page.goto(`/en/${route}`);
  await page.locator("body").waitFor();
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  // A document page shows a spinner until its data is in; its buttons come after.
  await page.locator(".animate-spin").first().waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(600);
}

interface SweepResult {
  seen: string[];
  findings: Finding[];
  scrollers: Finding[];
}

/** Click every candidate of every route from a fresh load, and measure what opens. */
async function sweep(page: Page, routes: string[], at = WIDTHS[0], widths = WIDTHS): Promise<SweepResult> {
  const result: SweepResult = { seen: [], findings: [], scrollers: [] };
  for (const route of routes) {
    await open(page, route, at);
    const list = await candidates(page);
    for (const candidate of list) {
      await open(page, route, at);
      try {
        if (candidate.kind === "button") {
          await (await rootOf(page))
            .getByRole("button", { name: candidate.name, exact: true })
            .filter({ visible: true })
            .first()
            .click({ timeout: 3000 });
        } else if (candidate.name.startsWith("row:")) {
          await page.getByRole("row").nth(1).getByRole("button", { name: candidate.name.slice(4), exact: true }).first().click({ timeout: 3000 });
        } else {
          await page.getByRole("row").nth(1).getByRole("button", { name: "More actions" }).click({ timeout: 3000 });
          await page.getByRole("menuitem", { name: candidate.name, exact: true }).click({ timeout: 3000 });
        }
      } catch {
        continue;
      }
      await page.waitForTimeout(700);
      const dialog = page.getByRole("dialog").filter({ visible: true }).last();
      if (!(await dialog.count())) continue;
      const title = ((await dialog.getByRole("heading").first().textContent().catch(() => "")) ?? "").trim();
      result.seen.push(`${route} → ${candidate.name} → ${title}`);

      for (const size of widths) {
        await page.setViewportSize(size);
        await page.waitForTimeout(250);
        // A dialog that only exists at some widths (the phone line editor)
        // closes when the screen grows: nothing left to measure.
        if (!(await dialog.count())) break;
        const at = { page: route, trigger: candidate.name, dialog: title, width: size.width };
        const { problems, notes } = await measure(dialog);
        for (const problem of problems) result.findings.push({ ...at, problem });
        for (const problem of notes) result.scrollers.push({ ...at, problem });
        for (const problem of await measureDropdown(page, dialog)) result.findings.push({ ...at, problem });
      }
    }
  }
  return result;
}

function report(name: string, result: SweepResult) {
  // Not under test-results/: any other Playwright run empties that folder.
  const out = path.join(os.tmpdir(), "probook-modal-stress", `${name}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(
    `[modal-stress:${name}] ${result.seen.length} dialogs opened, ${result.findings.length} findings, ${result.scrollers.length} scroller notes → ${out}`
  );
}

test.describe("Dialogs under stress", () => {
  test.setTimeout(30 * 60_000);

  test("every dialog of the application holds up to long words, big numbers and narrow screens", async ({ page }) => {
    await signUp(page);
    const ids = await seed(page);

    const result = await sweep(page, [
      "dashboard",
      "clients",
      "products",
      "suppliers",
      "phonebook",
      "quotes",
      `quotes/${ids.quoteId}`,
      "invoices",
      `invoices/${ids.invoiceId}`,
      "invoices/credit-notes",
      "delivery-notes",
      `delivery-notes/${ids.noteId}`,
      "purchases",
      `purchases/${ids.orderId}`,
      "expenses",
      "locations",
      "locations?tab=transfers",
      `locations/transfers/${ids.transferId}`,
      "reports",
      "settings",
    ]);
    report("app", result);
    // A sweep that opened nothing proves nothing: the discovery itself broke.
    expect(result.seen.length).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });

  test("the form pages' dialogs hold up on a phone, where lines are edited in a sheet", async ({ page }) => {
    await signUp(page);
    const ids = await seed(page);
    // Opened at phone width: the line editor is a dialog only there.
    const result = await sweep(
      page,
      [
        "quotes/new",
        `quotes/${ids.quoteId}/edit`,
        "invoices/new",
        "delivery-notes/new",
        "purchases/new",
        `purchases/${ids.orderId}/edit`,
        "locations/transfers/new",
      ],
      WIDTHS[2],
      // The sheet is a phone layout: it closes once the screen is wide.
      WIDTHS.slice(2)
    );
    report("forms", result);
    // A sweep that opened nothing proves nothing: the discovery itself broke.
    expect(result.seen.length).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });

  test("every dialog of the admin console holds up too", async ({ page }) => {
    await signUp(page, { company: LONG_NAME.slice(0, 80) });
    await setupPlatformAdmin(page);
    const tenants = await adminGet(page, "/api/admin/tenants");
    const rows = (Array.isArray(tenants.body) ? tenants.body : (tenants.body as { data: unknown[] }).data) as Array<{ id: string }>;

    const result = await sweep(page, [
      "admin",
      "admin/tenants",
      ...(rows[0] ? [`admin/tenants/${rows[0].id}`] : []),
      "admin/users",
      "admin/subscriptions",
      "admin/subscriptions/requests",
      "admin/subscription-invoices",
      "admin/plans",
      "admin/features",
      "admin/coupons",
      "admin/referrals",
      "admin/announcements",
      "admin/data-requests",
      "admin/platform-admins",
      "admin/rate-limits",
      "admin/audit-logs",
      "admin/system",
    ]);
    report("admin", result);
    // A sweep that opened nothing proves nothing: the discovery itself broke.
    expect(result.seen.length).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });
});
