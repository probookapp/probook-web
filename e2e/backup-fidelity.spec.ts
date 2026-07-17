import { test, expect, type Page } from "@playwright/test";
import { createHash } from "crypto";
import { signUp } from "./helpers";
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  setupClient,
  setupProduct,
  setupRegister,
  openSession,
} from "./api-helpers";

/**
 * Backup export/restore round-trip fidelity.
 *
 * The v2.0 backup silently dropped whole tables (variants, prices, locations,
 * stock, credit notes, purchase orders, ...) AND serialised camelCase keys that
 * the restore — which reads snake_case — never understood, so scalars quietly
 * reset to defaults. These tests seed a rich tenant, export it, restore that
 * export over the top, and assert everything comes back byte-for-byte.
 *
 * v3.1 additionally covers media (logos/photos via the deduped `assets` map),
 * users, and the full POS history — plus the two safety rules that bound the
 * user restore, which are the only place where "faithful" and "safe" disagree.
 */

const today = () => new Date().toISOString().slice(0, 10);

type Json = Record<string, unknown>;

/** Rows we compare are plain objects keyed by id. */
function byId(rows: unknown): Map<string, Json> {
  const map = new Map<string, Json>();
  for (const r of (rows ?? []) as Json[]) map.set(r.id as string, r);
  return map;
}

/**
 * Drop fields that legitimately change on every write, so two exports of the
 * same logical data compare equal. `updated_at` is Prisma @updatedAt (stamped at
 * restore time); the envelope's `created_at` is the moment of export.
 */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Json = {};
    for (const [k, v] of Object.entries(value as Json)) {
      if (k === "updated_at") continue;
      out[k] = normalize(v);
    }
    return out;
  }
  return value;
}

/** Sort arrays by id so ordering differences don't fail the comparison. */
function sortedById(rows: unknown): Json[] {
  return [...((rows ?? []) as Json[])].sort((a, b) =>
    String(a.id).localeCompare(String(b.id))
  );
}

async function exportBackup(
  page: Page,
  flags?: { photos?: boolean; secrets?: boolean }
): Promise<Json> {
  const qs = [
    flags?.photos ? "include_photos=1" : "",
    flags?.secrets ? "include_secrets=1" : "",
  ]
    .filter(Boolean)
    .join("&");
  const res = await apiGet(page, `/api/export${qs ? `?${qs}` : ""}`);
  expect(res.status).toBe(200);
  return res.body as Json;
}

/** The reference the export writes into a media column for `content`. */
function assetRef(content: string): string {
  return `asset:${createHash("sha256").update(content).digest("hex")}`;
}

async function restoreBackup(page: Page, payload: unknown) {
  const res = await apiPost(page, "/api/import/backup", payload);
  expect(res.status, `restore failed: ${JSON.stringify(res.body)}`).toBe(200);
  expect(res.body.success).toBe(true);
  return res.body;
}

/**
 * Seed a tenant that exercises every table v2.0 dropped:
 * 2 locations, a product with variants + tiered prices + stock split across both
 * locations, a second product moved between locations by a stock transfer, a
 * client + issued invoice + payment + credit note, a supplier + purchase order +
 * supplier payment, and a POS register + printer config.
 */
async function seedRichTenant(page: Page) {
  // Locations FIRST: creating a product with stock auto-creates a "Main"
  // default location otherwise, which would muddy the per-location assertions.
  const locA = (await apiPost(page, "/api/locations", {
    name: "A Warehouse",
    type: "warehouse",
    is_default: true,
  })).body as Json;
  const locB = (await apiPost(page, "/api/locations", {
    name: "B Shop",
    type: "store",
  })).body as Json;
  expect(locA.id).toBeTruthy();
  expect(locB.id).toBeTruthy();

  // Product with tiered prices; stock arrives via per-location adjustments.
  const widget = (await apiPost(page, "/api/products", {
    designation: "Widget",
    unit_price: 100,
    tax_rate: 19,
    unit: "unit",
    is_service: false,
    quantity: 0,
    purchase_price: 60,
    has_variants: true,
    prices: [
      { label: "retail", price: 100 },
      { label: "wholesale", price: 80 },
      { label: "super_wholesale", price: 70 },
    ],
  })).body as Json;
  expect(widget.id).toBeTruthy();

  const red = (await apiPost(page, `/api/products/${widget.id}/variants`, {
    name: "Red - L",
    sku: "W-RED-L",
    barcode: "1111111111",
    attributes: { color: "Red", size: "L" },
    quantity: 0,
    price_override: 110,
  })).body as Json;
  const blue = (await apiPost(page, `/api/products/${widget.id}/variants`, {
    name: "Blue - M",
    sku: "W-BLU-M",
    attributes: { color: "Blue", size: "M" },
    quantity: 0,
  })).body as Json;
  expect(red.id).toBeTruthy();
  expect(blue.id).toBeTruthy();

  // Variant stock split across BOTH locations: Red 10@A + 4@B, Blue 3@B.
  await apiPost(page, `/api/products/${widget.id}/adjust-stock`, {
    variant_id: red.id,
    location_id: locA.id,
    quantity_change: 10,
  });
  await apiPost(page, `/api/products/${widget.id}/adjust-stock`, {
    variant_id: red.id,
    location_id: locB.id,
    quantity_change: 4,
  });
  await apiPost(page, `/api/products/${widget.id}/adjust-stock`, {
    variant_id: blue.id,
    location_id: locB.id,
    quantity_change: 3,
  });

  // Non-variant product: 20 into A, then transfer 8 to B -> 12@A / 8@B.
  const gadget = (await apiPost(page, "/api/products", {
    designation: "Gadget",
    unit_price: 50,
    tax_rate: 19,
    unit: "unit",
    is_service: false,
    quantity: 0,
  })).body as Json;
  await apiPost(page, `/api/products/${gadget.id}/adjust-stock`, {
    location_id: locA.id,
    quantity_change: 20,
  });
  const transfer = await apiPost(page, "/api/stock-transfers", {
    from_location_id: locA.id,
    to_location_id: locB.id,
    notes: "rebalance",
    lines: [{ product_id: gadget.id, quantity: 8 }],
  });
  expect(transfer.status).toBe(201);

  // Client -> invoice -> issue -> payment -> credit note.
  const client = (await apiPost(page, "/api/clients", {
    name: "Acme SARL",
    email: "acme@example.com",
    city: "Alger",
  })).body as Json;
  // NOTE: the issued invoice deliberately uses a description-only line (no
  // product_id). POST /api/invoices/:id/issue decrements product.quantity
  // directly instead of going through applyStockChange, so it does NOT touch
  // stock_levels — the aggregate silently drifts from the sum of per-location
  // levels. That's a pre-existing bug in the issue route (outside this feature),
  // and pointing the line at a product here would corrupt the stock fixture
  // before the backup is even taken.
  const invoice = (await apiPost(page, "/api/invoices", {
    client_id: client.id,
    issue_date: today(),
    lines: [
      {
        description: "Consulting services",
        quantity: 2,
        unit_price: 50,
        tax_rate: 19,
      },
    ],
  })).body as Json;
  expect(invoice.id).toBeTruthy();

  const issued = await apiPost(page, `/api/invoices/${invoice.id}/issue`);
  expect(issued.status).toBe(200);

  // A second, DRAFT invoice carrying a real product_id line: covers the
  // invoice_lines product FK + cost_price_snapshot round-trip, and staying in
  // DRAFT means it never touches stock.
  const draftInvoice = (await apiPost(page, "/api/invoices", {
    client_id: client.id,
    issue_date: today(),
    lines: [
      {
        product_id: gadget.id,
        description: "Gadget sale",
        quantity: 3,
        unit_price: 50,
        tax_rate: 19,
      },
    ],
  })).body as Json;
  expect(draftInvoice.id).toBeTruthy();

  const payment = await apiPost(page, "/api/payments", {
    invoice_id: invoice.id,
    amount: 59.5,
    payment_date: today(),
    payment_method: "CASH",
    reference: "PAY-1",
  });
  expect(payment.status).toBeLessThan(300);

  // restock:false keeps the stock assertions deterministic.
  const creditNote = await apiPost(page, "/api/credit-notes", {
    client_id: client.id,
    invoice_id: invoice.id,
    issue_date: today(),
    reason: "damaged goods",
    restock: false,
    lines: [
      {
        product_id: gadget.id,
        description: "Gadget refund",
        quantity: 1,
        unit_price: 50,
        tax_rate: 19,
      },
    ],
  });
  expect(creditNote.status).toBeLessThan(300);

  // Supplier -> purchase order -> supplier payment.
  const supplier = (await apiPost(page, "/api/suppliers", {
    name: "Global Supply",
    email: "gs@example.com",
  })).body as Json;
  const po = (await apiPost(page, "/api/purchases", {
    supplier_id: supplier.id,
    order_date: today(),
    location_id: locA.id,
    notes: "restock order",
    lines: [
      {
        product_id: widget.id,
        variant_id: red.id,
        quantity: 5,
        unit_price: 60,
        tax_rate: 19,
      },
    ],
  })).body as Json;
  expect(po.id).toBeTruthy();

  const supPay = await apiPost(page, `/api/suppliers/${supplier.id}/payments`, {
    amount: 100,
    payment_date: today(),
    payment_method: "BANK_TRANSFER",
    purchase_order_id: po.id,
    reference: "SP-1",
  });
  expect(supPay.status).toBeLessThan(300);

  // POS register + printer config (no User FK -> both must round-trip).
  const register = (await apiPost(page, "/api/pos/registers", {
    name: "Front Desk",
    is_active: true,
  })).body as Json;
  const printer = await apiPost(page, "/api/pos/printers", {
    register_id: register.id,
    printer_name: "Epson TM-T20",
    connection_type: "network",
    connection_address: "192.168.1.50",
    paper_width: 58,
    is_default: true,
  });
  expect(printer.status).toBeLessThan(300);

  // An employee with deliberately lopsided CRUD flags. Users are never deleted
  // or recreated by the restore, but their permissions ARE deleted — so these
  // flags are the thing that used to vanish for good.
  const employee = (await apiPost(page, "/api/auth/users", {
    username: `emp_${Date.now().toString(36)}`,
    display_name: "Limited Employee",
    password: "Test1234!",
    role: "employee",
    permission_details: [
      {
        key: "products",
        can_view: true,
        can_create: false,
        can_edit: false,
        can_delete: false,
      },
      {
        key: "invoices",
        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: false,
      },
    ],
  })).body as Json;
  expect(employee.id).toBeTruthy();

  return {
    employee,
    locA,
    locB,
    widget,
    red,
    blue,
    gadget,
    client,
    invoice,
    draftInvoice,
    supplier,
    po,
  };
}

test.describe("backup export/restore fidelity", () => {
  // Each test signs up, seeds ~20 records across a dozen tables, then runs two
  // full exports and a whole-tenant restore. That comfortably exceeds the 30s
  // default, especially on a cold dev-server compile.
  test.describe.configure({ timeout: 120_000 });

  test("v3 export round-trips every table, preserving the per-location stock split", async ({
    page,
  }) => {
    await signUp(page);
    const seed = await seedRichTenant(page);

    const before = await exportBackup(page);
    expect(before.version).toBe("3.1");

    // Sanity: the export actually carries the tables v2.0 dropped.
    for (const key of [
      "locations",
      "product_variants",
      "product_prices",
      "stock_levels",
      "stock_movements",
      "stock_transfers",
      "credit_notes",
      "purchase_orders",
      "supplier_payments",
      "pos_registers",
      "pos_printer_configs",
    ]) {
      expect(
        (before[key] as unknown[])?.length,
        `export is missing rows for ${key}`
      ).toBeGreaterThan(0);
    }

    // Capture the original per-location split for the strongest assertion.
    const levelsBefore = before.stock_levels as Json[];
    const redA = levelsBefore.find(
      (l) => l.variant_id === seed.red.id && l.location_id === seed.locA.id
    );
    const redB = levelsBefore.find(
      (l) => l.variant_id === seed.red.id && l.location_id === seed.locB.id
    );
    expect(redA?.quantity).toBe(10);
    expect(redB?.quantity).toBe(4);

    const result = await restoreBackup(page, before);

    // Prove the restore actually recreated rows — otherwise a no-op import would
    // make the export-vs-export comparison below pass vacuously.
    const counts = result.imported as Json;
    expect(counts.locations).toBe(2);
    expect(counts.products).toBe(2);
    expect(counts.product_variants).toBe(2);
    expect(counts.product_prices).toBe(3);
    expect(counts.invoices).toBe(2);
    expect(counts.credit_notes).toBe(1);
    expect(counts.purchase_orders).toBe(1);
    expect(counts.supplier_payments).toBe(1);
    expect(counts.pos_registers).toBe(1);
    expect(counts.pos_printer_configs).toBe(1);
    expect(counts.stock_transfers).toBe(1);
    expect(counts.stock_levels).toBe((before.stock_levels as Json[]).length);
    expect(counts.stock_movements).toBe((before.stock_movements as Json[]).length);

    const after = await exportBackup(page);

    // ── Whole-payload round-trip ──
    const tables = [
      "locations",
      "clients",
      "products",
      "product_categories",
      "product_variants",
      "product_prices",
      "stock_levels",
      "stock_movements",
      "stock_transfers",
      "quotes",
      "invoices",
      "payments",
      "delivery_notes",
      "credit_notes",
      "purchase_orders",
      "supplier_payments",
      "pos_registers",
      "pos_printer_configs",
      "expenses",
      "suppliers",
      "product_suppliers",
      "client_contacts",
      "reminders",
      "users",
      "user_permissions",
      "pos_sessions",
      "pos_transactions",
      "pos_cash_movements",
    ];
    for (const key of tables) {
      expect(
        normalize(sortedById(after[key])),
        `${key} did not round-trip`
      ).toEqual(normalize(sortedById(before[key])));
    }
    expect(normalize(after.settings)).toEqual(normalize(before.settings));

    // ── Spot-checks on the things v2.0 silently destroyed ──
    const variants = byId(after.product_variants);
    const redAfter = variants.get(seed.red.id as string)!;
    expect(redAfter.name).toBe("Red - L");
    expect(redAfter.sku).toBe("W-RED-L");
    expect(redAfter.price_override).toBe(110);
    // Json attributes survive verbatim (keys not mangled by snake_casing).
    expect(redAfter.attributes).toEqual({ color: "Red", size: "L" });

    const prices = (after.product_prices as Json[]).filter(
      (p) => p.product_id === seed.widget.id
    );
    expect(Object.fromEntries(prices.map((p) => [p.label, p.price]))).toEqual({
      retail: 100,
      wholesale: 80,
      super_wholesale: 70,
    });

    // Scalars that the camelCase/snake_case mismatch used to reset to defaults.
    const widgetAfter = byId(after.products).get(seed.widget.id as string)!;
    expect(widgetAfter.unit_price).toBe(100);
    expect(widgetAfter.tax_rate).toBe(19);
    expect(widgetAfter.purchase_price).toBe(60);
    expect(widgetAfter.has_variants).toBe(true);

    const invoiceAfter = byId(after.invoices).get(seed.invoice.id as string)!;
    expect(invoiceAfter.status).toBe("ISSUED");
    expect(invoiceAfter.total).toBe(119);
    expect((invoiceAfter.lines as Json[])[0].unit_price).toBe(50);
    // The integrity hash must survive, or every issued invoice fails verification.
    expect(invoiceAfter.integrity_hash).toBeTruthy();
    expect(invoiceAfter.integrity_hash).toBe(
      byId(before.invoices).get(seed.invoice.id as string)!.integrity_hash
    );

    // The DRAFT invoice keeps its product FK and status.
    const draftAfter = byId(after.invoices).get(seed.draftInvoice.id as string)!;
    expect(draftAfter.status).toBe("DRAFT");
    expect((draftAfter.lines as Json[])[0].product_id).toBe(seed.gadget.id);

    expect((after.credit_notes as Json[])[0].total).toBe(59.5);
    expect((after.purchase_orders as Json[])[0].total).toBe(357);
    expect((after.supplier_payments as Json[])[0].amount).toBe(100);
    expect((after.pos_printer_configs as Json[])[0].paper_width).toBe(58);

    // ── Employee permissions survive (they used to be wiped for good) ──
    expect(counts.user_permissions).toBe(2);
    const users = (await apiGet(page, "/api/auth/users")).body as unknown as Json[];
    const empAfter = users.find((u) => u.id === seed.employee.id);
    expect(empAfter, "employee vanished from the restore").toBeTruthy();
    const details = (empAfter!.permission_details as Json[]).sort((a, b) =>
      String(a.key).localeCompare(String(b.key))
    );
    expect(details).toEqual([
      {
        key: "invoices",
        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: false,
      },
      {
        key: "products",
        can_view: true,
        can_create: false,
        can_edit: false,
        can_delete: false,
      },
    ]);

    // ── CRITICAL: per-location split preserved, not collapsed ──
    const levelsAfter = after.stock_levels as Json[];
    const redAAfter = levelsAfter.find(
      (l) => l.variant_id === seed.red.id && l.location_id === seed.locA.id
    );
    const redBAfter = levelsAfter.find(
      (l) => l.variant_id === seed.red.id && l.location_id === seed.locB.id
    );
    expect(redAAfter?.quantity).toBe(10);
    expect(redBAfter?.quantity).toBe(4);

    // The transferred product keeps its 12/8 split across two locations.
    const gadgetLevels = levelsAfter.filter(
      (l) => l.product_id === seed.gadget.id
    );
    expect(gadgetLevels).toHaveLength(2);
    expect(
      gadgetLevels.map((l) => l.quantity).sort((a, b) => (a as number) - (b as number))
    ).toEqual([8, 12]);

    // Stock is genuinely spread over both locations, not piled onto the default.
    const usedLocations = new Set(levelsAfter.map((l) => l.location_id));
    expect(usedLocations.has(seed.locA.id)).toBe(true);
    expect(usedLocations.has(seed.locB.id)).toBe(true);

    // ── Aggregate quantity still equals the sum of per-location levels ──
    const redTotal = levelsAfter
      .filter((l) => l.variant_id === seed.red.id)
      .reduce((s, l) => s + (l.quantity as number), 0);
    expect(redAfter.quantity).toBe(redTotal);
    expect(redTotal).toBe(14);

    const gadgetAfter = byId(after.products).get(seed.gadget.id as string)!;
    expect(gadgetAfter.quantity).toBe(
      gadgetLevels.reduce((s, l) => s + (l.quantity as number), 0)
    );
    expect(gadgetAfter.quantity).toBe(20);
  });

  test("a v2-style payload (no locations/stock_levels) still restores via the fallback", async ({
    page,
  }) => {
    await signUp(page);
    const seed = await seedRichTenant(page);

    const full = await exportBackup(page);

    // Strip everything a v2.0 file never had. Stock transfers/movements
    // reference locations, so they go too — a real v2 file had none of them.
    const v2Payload: Json = { ...full, version: "2.0" };
    delete v2Payload.locations;
    delete v2Payload.stock_levels;
    delete v2Payload.stock_movements;
    delete v2Payload.stock_transfers;
    // v2.0 predates both the user table export and the v3.1 assets map.
    delete v2Payload.users;
    delete v2Payload.assets;
    // v2.0 had no locations at all, so nothing could reference one. Null the
    // FKs that would otherwise dangle now that `locations` is gone.
    v2Payload.purchase_orders = (full.purchase_orders as Json[]).map((po) => ({
      ...po,
      location_id: null,
    }));
    v2Payload.pos_registers = (full.pos_registers as Json[]).map((r) => ({
      ...r,
      location_id: null,
    }));

    const result = await restoreBackup(page, v2Payload);

    // The verbatim stock path must NOT have run: no stock_levels in the payload
    // means the legacy fallback rebuilt them instead.
    expect((result.imported as Json).stock_levels).toBeUndefined();

    const after = await exportBackup(page);

    // The fallback reconstructs a single default location ("Main", since the
    // backup carried none) and rebuilds levels from each product's aggregate.
    const locations = after.locations as Json[];
    expect(locations).toHaveLength(1);
    expect(locations[0].is_default).toBe(true);
    const mainId = locations[0].id;

    const levels = after.stock_levels as Json[];
    expect(levels.length).toBeGreaterThan(0);
    for (const l of levels) expect(l.location_id).toBe(mainId);

    // Aggregate quantity still equals the sum of per-location levels.
    const gadgetAfter = byId(after.products).get(seed.gadget.id as string)!;
    const gadgetSum = levels
      .filter((l) => l.product_id === seed.gadget.id)
      .reduce((s, l) => s + (l.quantity as number), 0);
    expect(gadgetAfter.quantity).toBe(20);
    expect(gadgetSum).toBe(20);

    // The non-stock tables still round-trip from a v2-shaped payload.
    expect(byId(after.clients).get(seed.client.id as string)?.name).toBe(
      "Acme SARL"
    );
    expect((after.credit_notes as Json[])).toHaveLength(1);
    expect((after.purchase_orders as Json[])).toHaveLength(1);
    expect((after.product_variants as Json[])).toHaveLength(2);
  });

  // ── 1. MEDIA ──
  test("logos and product photos round-trip through the deduped assets map", async ({
    page,
  }) => {
    await signUp(page);
    await seedRichTenant(page);

    // Two distinct payloads so we can tell logo and photo apart by content.
    const LOGO =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const PHOTO =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    expect(LOGO).not.toBe(PHOTO);

    // `logo_snapshot` has no write API (it is stamped by the document issuer) and
    // product photos need object storage, so seed the media by restoring a
    // payload that carries it INLINE. That doubles as the v2/v3.0 BACK-COMPAT
    // check: raw base64 with no "asset:" prefix, and no `assets` map at all,
    // must pass straight through to the column.
    const seedPayload = await exportBackup(page);
    const v30: Json = { ...seedPayload, version: "3.0" };
    delete v30.assets;
    v30.invoices = (seedPayload.invoices as Json[]).map((i) => ({
      ...i,
      logo_snapshot: LOGO,
    }));
    v30.products = (seedPayload.products as Json[]).map((p) => ({
      ...p,
      photo_path: PHOTO,
    }));
    v30.settings = { ...(seedPayload.settings as Json), logo_path: LOGO };
    await restoreBackup(page, v30);

    // ── Export WITHOUT the photo flag ──
    const lean = await exportBackup(page);
    expect(lean.version).toBe("3.1");

    // DEDUPE: 2 invoices + settings all reference the same logo -> ONE entry.
    const leanAssets = lean.assets as Record<string, string>;
    expect(Object.keys(leanAssets)).toHaveLength(1);
    const logoRef = assetRef(LOGO);
    expect(leanAssets[logoRef.slice("asset:".length)]).toBe(LOGO);

    const leanInvoices = lean.invoices as Json[];
    expect(leanInvoices.length).toBeGreaterThan(1);
    for (const inv of leanInvoices) expect(inv.logo_snapshot).toBe(logoRef);
    expect((lean.settings as Json).logo_path).toBe(logoRef);

    // Photos are opt-in: without the flag the key is absent entirely, and the
    // photo's bytes never reach the assets map.
    for (const p of lean.products as Json[]) {
      expect(p.photo_path).toBeUndefined();
    }
    expect(leanAssets[assetRef(PHOTO).slice("asset:".length)]).toBeUndefined();

    // ── Export WITH ?include_photos=1 ──
    const full = await exportBackup(page, { photos: true });
    const fullAssets = full.assets as Record<string, string>;
    // Logo + photo, deduped: both products share one photo, 3 rows share one logo.
    expect(Object.keys(fullAssets)).toHaveLength(2);
    const photoRef = assetRef(PHOTO);
    expect(fullAssets[photoRef.slice("asset:".length)]).toBe(PHOTO);

    const fullProducts = full.products as Json[];
    expect(fullProducts.length).toBeGreaterThan(1);
    for (const p of fullProducts) expect(p.photo_path).toBe(photoRef);

    // ── Restore the v3.1 payload: bytes must come back byte-identical ──
    await restoreBackup(page, full);
    const again = await exportBackup(page, { photos: true });

    expect(again.assets).toEqual(full.assets);
    expect((again.assets as Json)[logoRef.slice("asset:".length)]).toBe(LOGO);
    expect((again.assets as Json)[photoRef.slice("asset:".length)]).toBe(PHOTO);
    expect(normalize(again.settings)).toEqual(normalize(full.settings));
    expect(normalize(sortedById(again.invoices))).toEqual(
      normalize(sortedById(full.invoices))
    );
    expect(normalize(sortedById(again.products))).toEqual(
      normalize(sortedById(full.products))
    );

    // ── A reference whose asset is missing restores as null, not a crash ──
    await restoreBackup(page, { ...full, assets: {} });
    const orphaned = await exportBackup(page, { photos: true });
    expect(orphaned.assets).toEqual({});
    for (const inv of orphaned.invoices as Json[]) {
      expect(inv.logo_snapshot).toBeNull();
    }
    for (const p of orphaned.products as Json[]) {
      expect(p.photo_path).toBeNull();
    }
    expect((orphaned.settings as Json).logo_path).toBeNull();
  });

  // ── 3. POS HISTORY ──
  test("a POS session, transaction and cash movement round-trip", async ({
    page,
  }) => {
    await signUp(page);

    const product = await setupProduct(page, "Coffee", 10, { quantity: 100 });
    const client = await setupClient(page, "Walk-in");
    const register = await setupRegister(page, "Till 1");
    const session = await openSession(page, register.id as string, 200);
    expect(session.id).toBeTruthy();

    const txRes = await apiPost(page, "/api/pos/transactions", {
      register_id: register.id,
      session_id: session.id,
      client_id: client.id,
      notes: "morning rush",
      lines: [
        {
          product_id: product.id,
          designation: "Coffee",
          quantity: 2,
          unit_price: 10,
          tax_rate: 19,
        },
      ],
      payments: [
        {
          payment_method: "CASH",
          amount: 23.8,
          cash_given: 50,
          change_given: 26.2,
        },
      ],
    });
    expect(txRes.status, JSON.stringify(txRes.body)).toBeLessThan(300);

    const cashRes = await apiPost(page, "/api/pos/cash-movements", {
      session_id: session.id,
      movement_type: "OUT",
      amount: 15,
      reason: "petty cash",
      reference: "PC-1",
    });
    expect(cashRes.status, JSON.stringify(cashRes.body)).toBeLessThan(300);

    const before = await exportBackup(page);
    // v3.0 exported none of these — the whole point of v3.1.
    expect((before.pos_sessions as Json[]).length).toBe(1);
    expect((before.pos_transactions as Json[]).length).toBe(1);
    expect((before.pos_cash_movements as Json[]).length).toBe(1);
    expect(
      ((before.pos_transactions as Json[])[0].lines as Json[]).length
    ).toBe(1);
    expect(
      ((before.pos_transactions as Json[])[0].payments as Json[]).length
    ).toBe(1);

    const result = await restoreBackup(page, before);
    const counts = result.imported as Json;
    expect(counts.pos_registers).toBe(1);
    expect(counts.pos_sessions).toBe(1);
    expect(counts.pos_transactions).toBe(1);
    expect(counts.pos_cash_movements).toBe(1);

    const after = await exportBackup(page);
    for (const key of [
      "pos_registers",
      "pos_sessions",
      "pos_transactions",
      "pos_cash_movements",
    ]) {
      expect(
        normalize(sortedById(after[key])),
        `${key} did not round-trip`
      ).toEqual(normalize(sortedById(before[key])));
    }

    // Spot-checks on the values a naive restore would reset to a default.
    const sessionAfter = (after.pos_sessions as Json[])[0];
    expect(sessionAfter.opening_float).toBe(200);
    expect(sessionAfter.status).toBe("OPEN");
    expect(sessionAfter.register_id).toBe(register.id);

    const txAfter = (after.pos_transactions as Json[])[0];
    expect(txAfter.session_id).toBe(session.id);
    expect(txAfter.client_id).toBe(client.id);
    expect(txAfter.final_amount).toBe(23.8);
    expect(txAfter.notes).toBe("morning rush");

    const lineAfter = (txAfter.lines as Json[])[0];
    expect(lineAfter.product_id).toBe(product.id);
    expect(lineAfter.designation).toBe("Coffee");
    expect(lineAfter.unit_price).toBe(10);
    // Frozen COGS basis: a 0 here silently rewrites every POS margin report.
    expect(lineAfter.cost_price_snapshot).toBe(
      ((before.pos_transactions as Json[])[0].lines as Json[])[0]
        .cost_price_snapshot
    );

    const payAfter = (txAfter.payments as Json[])[0];
    expect(payAfter.payment_method).toBe("CASH");
    expect(payAfter.cash_given).toBe(50);
    expect(payAfter.change_given).toBe(26.2);

    const moveAfter = (after.pos_cash_movements as Json[])[0];
    expect(moveAfter.movement_type).toBe("OUT");
    expect(moveAfter.amount).toBe(15);
    expect(moveAfter.reason).toBe("petty cash");
    expect(moveAfter.session_id).toBe(session.id);

    // The POS history still hangs off a real user, and the session is still
    // usable — i.e. the restore did not orphan it.
    const active = await apiGet(
      page,
      `/api/pos/sessions/active/${register.id}`
    );
    expect(active.status).toBe(200);
    expect((active.body as Json).id).toBe(session.id);
  });

  // ── 2. USERS + the password-safety rule ──
  test("users round-trip, and a restore never rolls back an existing password", async ({
    page,
  }) => {
    const admin = await signUp(page);

    const OLD = "OldPass123!";
    const NEW = "NewPass456!";
    const stamp = Date.now().toString(36);
    const keeperName = `keeper_${stamp}`;
    const goneName = `gone_${stamp}`;

    // `keeper` stays put and changes password after the backup is taken.
    const keeper = (await apiPost(page, "/api/auth/users", {
      username: keeperName,
      display_name: "Keeper",
      password: OLD,
      role: "employee",
    })).body as Json;
    // `gone` is deleted after the backup and must come back complete.
    const gone = (await apiPost(page, "/api/auth/users", {
      username: goneName,
      display_name: "Gone",
      password: OLD,
      role: "employee",
    })).body as Json;
    expect(keeper.id).toBeTruthy();
    expect(gone.id).toBeTruthy();

    // A PLAIN export must never carry password hashes.
    const plain = await exportBackup(page);
    for (const u of plain.users as Json[]) {
      expect(u.password_hash).toBeUndefined();
    }

    // The encrypted export path asks for them explicitly; it encrypts in the
    // browser before anything is written to disk.
    const secret = await exportBackup(page, { secrets: true });
    const secretUsers = byId(secret.users);
    expect(secretUsers.get(keeper.id as string)?.password_hash).toBeTruthy();
    expect(secretUsers.get(gone.id as string)?.password_hash).toBeTruthy();

    // ── Mutate the tenant AFTER the backup ──
    await apiPut(page, `/api/auth/users/${keeper.id}`, {
      username: keeperName,
      display_name: "Keeper",
      password: NEW,
      role: "employee",
      is_active: true,
    });
    expect((await apiDelete(page, `/api/auth/users/${gone.id}`)).status).toBeLessThan(300);

    // ── SAFETY: a payload that tries to demote/disable the calling admin ──
    const hostile: Json = {
      ...secret,
      users: (secret.users as Json[]).map((u) =>
        u.username === admin.username
          ? { ...u, role: "employee", is_active: false, display_name: "HIJACKED" }
          : u
      ),
    };

    const result = await restoreBackup(page, hostile);
    const counts = result.imported as Json;
    // keeper updated + gone recreated; the admin row was skipped.
    expect(counts.users).toBe(2);
    expect(counts.users_skipped).toBe(1);

    const after = await exportBackup(page);
    const usersAfter = byId(after.users);

    // The admin is untouched — still an active admin, still named as before.
    const adminAfter = [...usersAfter.values()].find(
      (u) => u.username === admin.username
    )!;
    expect(adminAfter.role).toBe("admin");
    expect(adminAfter.is_active).toBe(true);
    expect(adminAfter.display_name).not.toBe("HIJACKED");

    // The deleted user came back, id and all.
    const goneAfter = usersAfter.get(gone.id as string);
    expect(goneAfter, "deleted user was not restored").toBeTruthy();
    expect(goneAfter!.display_name).toBe("Gone");
    expect(goneAfter!.role).toBe("employee");

    // ── SAFETY: an incoming username owned by a DIFFERENT user is skipped ──
    const squatter: Json = {
      ...secret,
      users: (secret.users as Json[]).map((u) =>
        u.id === gone.id ? { ...u, id: `${gone.id}-clone`, username: keeperName } : u
      ),
    };
    const squatResult = await restoreBackup(page, squatter);
    // admin skipped + the clone skipped for colliding with keeper's username.
    expect((squatResult.imported as Json).users_skipped).toBe(2);
    const afterSquat = await exportBackup(page);
    expect(byId(afterSquat.users).get(`${gone.id}-clone`)).toBeUndefined();

    // ── The rule that matters: log in for real ──
    // Everything below replaces the page's session cookie, so it must run last.
    const loginNew = await apiPost(page, "/api/auth/login", {
      username: keeperName,
      password: NEW,
    });
    expect(
      loginNew.status,
      "restoring a backup rolled an existing user's password back to its old value"
    ).toBe(200);

    const loginOld = await apiPost(page, "/api/auth/login", {
      username: keeperName,
      password: OLD,
    });
    expect(loginOld.status, "the stale password from the backup was applied").toBe(401);

    // The counterpart: a user CREATED by the restore does get the hash from the
    // (encrypted) payload, so a deleted account comes back fully usable.
    const loginRestored = await apiPost(page, "/api/auth/login", {
      username: goneName,
      password: OLD,
    });
    expect(
      loginRestored.status,
      "a restored user could not log in with the password the backup captured"
    ).toBe(200);
  });

  test("a lean (photo-less) backup restore preserves existing product photos", async ({
    page,
  }) => {
    await signUp(page);
    await seedRichTenant(page);

    const PHOTO =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const photoRef = assetRef(PHOTO);

    // Seed photos inline (no write API for photo_path from e2e — see the media test).
    const seed = await exportBackup(page);
    const inline: Json = { ...seed, version: "3.0" };
    delete inline.assets;
    inline.products = (seed.products as Json[]).map((p) => ({
      ...p,
      photo_path: PHOTO,
    }));
    await restoreBackup(page, inline);

    // Sanity: the catalogue really has photos now.
    const before = await exportBackup(page, { photos: true });
    expect((before.products as Json[]).length).toBeGreaterThan(0);
    for (const p of before.products as Json[]) expect(p.photo_path).toBe(photoRef);

    // Take the DEFAULT (lean) backup — it carries no photo data at all …
    const lean = await exportBackup(page);
    expect(lean.includes_photos).toBe(false);
    for (const p of lean.products as Json[]) expect(p.photo_path).toBeUndefined();

    // … and restoring it must NOT wipe the photos. A lean backup says nothing
    // about photos; treating that as "delete them" would make the default
    // backup silently destructive.
    await restoreBackup(page, lean);

    const after = await exportBackup(page, { photos: true });
    expect((after.products as Json[]).length).toBe(
      (before.products as Json[]).length
    );
    for (const p of after.products as Json[]) {
      expect(
        p.photo_path,
        "a photo-less backup restore destroyed an existing product photo"
      ).toBe(photoRef);
    }
  });
});
