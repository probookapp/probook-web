import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { withAdmin, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

/**
 * Tenant backup export (v3.1).
 *
 * v2.0 silently dropped whole tables. v3.0 additionally exports:
 * product_variants, product_prices, locations, stock_levels, stock_movements,
 * stock_transfers(+lines), credit_notes(+lines), purchase_orders(+lines),
 * supplier_payments, pos_registers and pos_printer_configs.
 *
 * v3.1 closes the last three gaps:
 *
 *  1. MEDIA. Inline images (quote/invoice `logo_snapshot`, settings `logo_path`
 *     and — opt-in — `products.photo_path`) used to be stripped, so a restored
 *     document re-rendered with whatever logo the tenant happened to have at
 *     restore time. They now travel in a content-addressed `assets` map:
 *     { "<sha256hex>": "<base64>" }, and the column holds "asset:<sha256hex>".
 *     Dedupe is by content hash, so the one logo shared by N invoices is stored
 *     ONCE no matter how many documents reference it.
 *  2. USERS. Exported with `password_hash` ONLY under `?include_secrets=1`,
 *     which the UI passes solely on the CLIENT-ENCRYPTED export path so hashes
 *     never touch disk in plaintext. A plain JSON export still omits it.
 *  3. POS HISTORY. pos_sessions, pos_transactions(+lines, +pos_payments) and
 *     pos_cash_movements now export too — they hold a hard FK to `users`, which
 *     the restore finally recreates.
 *
 * Query flags:
 *   ?include_photos=1   also export products.photo_path (large; opt-in)
 *   ?include_secrets=1  also export users.password_hash (encrypted export only)
 *
 * Keys are emitted in snake_case via `toSnakeCase` — the app-wide API
 * convention, and what /api/import/backup reads. v2.0 emitted raw Prisma
 * camelCase, which the restore did not understand, so almost every scalar
 * (unit_price, tax_rate, issue_date, ...) silently fell back to a default on
 * re-import. The restore now accepts both spellings, so old files still work.
 *
 * NOTHING is deliberately excluded any more, with one exception: auth material
 * other than the password hash (TOTP secrets, backup codes, reset tokens, live
 * sessions) is never exported — it is device/session state, not tenant data.
 */

type Row = Record<string, unknown>;

/** snake_case a list of Prisma rows and widen it for post-processing. */
function rows<T>(list: T[]): Row[] {
  return toSnakeCase(list) as unknown as Row[];
}

/**
 * Does this media column hold the image itself, rather than a pointer to it?
 *
 * These columns are plain strings and, depending on how the row was created,
 * carry either the bytes inline (a `data:` URL or a bare base64 blob — the
 * legacy shape) or a reference to a file stored elsewhere (a Supabase public
 * URL, an absolute path). Only the former is worth hashing into `assets`;
 * a URL is already a short, stable reference and stays inline verbatim.
 */
function isInlineMedia(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("data:")) return true; // inline image, scheme and all
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false; // http(s):, blob:, ...
  if (value.startsWith("/")) return false; // absolute path
  return true; // bare base64 blob
}

export const GET = withAdmin(async (req, { tenantId }) => {
  const includePhotos = req.nextUrl.searchParams.get("include_photos") === "1";
  const includeSecrets = req.nextUrl.searchParams.get("include_secrets") === "1";

  const [
    clients,
    products,
    productCategories,
    productVariants,
    productPrices,
    locations,
    stockLevels,
    stockMovements,
    stockTransfers,
    quotes,
    invoices,
    payments,
    deliveryNotes,
    creditNotes,
    purchaseOrders,
    supplierPayments,
    posRegisters,
    posPrinterConfigs,
    posSessions,
    posTransactions,
    posCashMovements,
    expenses,
    suppliers,
    productSuppliers,
    clientContacts,
    reminders,
    users,
    userPermissions,
    settings,
  ] = await Promise.all([
    prisma.client.findMany({ where: { tenantId } }),
    prisma.product.findMany({ where: { tenantId } }),
    prisma.productCategory.findMany({ where: { tenantId } }),
    prisma.productVariant.findMany({ where: { tenantId } }),
    prisma.productPrice.findMany({ where: { tenantId } }),
    prisma.location.findMany({ where: { tenantId } }),
    prisma.stockLevel.findMany({ where: { tenantId } }),
    prisma.stockMovement.findMany({ where: { tenantId } }),
    prisma.stockTransfer.findMany({
      where: { tenantId },
      include: { lines: true },
    }),
    prisma.quote.findMany({
      where: { tenantId },
      include: { lines: { orderBy: { position: "asc" } } },
    }),
    prisma.invoice.findMany({
      where: { tenantId },
      include: { lines: { orderBy: { position: "asc" } } },
    }),
    prisma.payment.findMany({ where: { tenantId } }),
    prisma.deliveryNote.findMany({
      where: { tenantId },
      include: { lines: { orderBy: { position: "asc" } } },
    }),
    prisma.creditNote.findMany({
      where: { tenantId },
      include: { lines: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { tenantId },
      include: { lines: true },
    }),
    prisma.supplierPayment.findMany({ where: { tenantId } }),
    prisma.posRegister.findMany({ where: { tenantId } }),
    prisma.posPrinterConfig.findMany({ where: { tenantId } }),
    prisma.posSession.findMany({ where: { tenantId } }),
    prisma.posTransaction.findMany({
      where: { tenantId },
      include: { lines: { orderBy: { position: "asc" } }, payments: true },
    }),
    prisma.posCashMovement.findMany({ where: { tenantId } }),
    prisma.expense.findMany({ where: { tenantId } }),
    prisma.supplier.findMany({ where: { tenantId } }),
    prisma.productSupplier.findMany({ where: { tenantId } }),
    prisma.clientContact.findMany({ where: { tenantId } }),
    prisma.reminder.findMany({ where: { tenantId } }),
    prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        emailVerified: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Only under ?include_secrets=1 — see the header comment.
        passwordHash: includeSecrets,
      },
    }),
    prisma.userPermission.findMany({
      where: { user: { tenantId } },
    }),
    prisma.companySettings.findFirst({ where: { tenantId } }),
  ]);

  // ─── Content-addressed asset map ───
  // Every inline image in the payload is hashed once and stored once; the
  // columns keep an "asset:<sha256hex>" reference. Two invoices carrying an
  // identical logo snapshot therefore share a single entry.
  const assets: Record<string, string> = {};

  /** Hash `value` into `assets` and return its reference. */
  function toAsset(value: string): string {
    const hash = createHash("sha256").update(value).digest("hex");
    assets[hash] = value;
    return `asset:${hash}`;
  }

  /** Asset-ify an inline media column; pass URLs/paths/null through untouched. */
  function mediaField(value: string | null): string | null {
    if (value === null || !isInlineMedia(value)) return value;
    return toAsset(value);
  }

  // `photo_path` is opt-in: product photos dwarf every other column, and most
  // restores only care about the catalogue's data. Without the flag the key is
  // omitted entirely, exactly as v3.0 did.
  const productsClean = includePhotos
    ? rows(products).map((row, i) => ({
        ...row,
        photo_path: mediaField(products[i].photoPath),
      }))
    : // eslint-disable-next-line @typescript-eslint/no-unused-vars
      rows(products.map(({ photoPath, ...rest }) => rest));

  // `logo_snapshot` is the per-document base64 copy of the company logo frozen
  // at issue time. It is ALWAYS exported (via `assets`, so the shared logo costs
  // one entry, not one per document): without it a restored document silently
  // re-renders with the tenant's current logo instead of the one it was issued
  // with — a legal-document fidelity problem, not a cosmetic one.
  const quotesClean = rows(quotes).map((row, i) => ({
    ...row,
    logo_snapshot: mediaField(quotes[i].logoSnapshot),
  }));
  const invoicesClean = rows(invoices).map((row, i) => ({
    ...row,
    logo_snapshot: mediaField(invoices[i].logoSnapshot),
  }));

  // `attributes` is a Json column: re-attach it raw so toSnakeCase does not
  // rewrite user-defined keys inside the blob.
  const variantsClean = rows(productVariants).map((row, i) => ({
    ...row,
    attributes: productVariants[i].attributes,
  }));

  // Asset-ify the settings logo; keep the dashboard_layout Json blob raw.
  const settingsClean = settings
    ? (() => {
        const row = toSnakeCase(settings) as unknown as Row;
        row.dashboard_layout = settings.dashboardLayout;
        row.logo_path = mediaField(settings.logoPath);
        return row;
      })()
    : null;

  const backup = {
    version: "3.1",
    created_at: new Date().toISOString(),
    // Tells restore whether this payload is AUTHORITATIVE about product photos.
    // true  -> trust it verbatim (a null/missing photo means "no photo").
    // false -> the backup simply doesn't carry photos; restore must preserve
    //          whatever photos the products already have instead of nulling them.
    includes_photos: includePhotos,
    locations: rows(locations),
    clients: rows(clients),
    products: productsClean,
    product_categories: rows(productCategories),
    product_variants: variantsClean,
    product_prices: rows(productPrices),
    stock_levels: rows(stockLevels),
    stock_movements: rows(stockMovements),
    stock_transfers: rows(stockTransfers),
    quotes: quotesClean,
    invoices: invoicesClean,
    payments: rows(payments),
    delivery_notes: rows(deliveryNotes),
    credit_notes: rows(creditNotes),
    purchase_orders: rows(purchaseOrders),
    supplier_payments: rows(supplierPayments),
    pos_registers: rows(posRegisters),
    pos_printer_configs: rows(posPrinterConfigs),
    pos_sessions: rows(posSessions),
    pos_transactions: rows(posTransactions),
    pos_cash_movements: rows(posCashMovements),
    expenses: rows(expenses),
    suppliers: rows(suppliers),
    product_suppliers: rows(productSuppliers),
    client_contacts: rows(clientContacts),
    reminders: rows(reminders),
    users: rows(users),
    user_permissions: rows(userPermissions),
    settings: settingsClean,
    assets,
  };

  const json = JSON.stringify(backup, null, 2);

  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="probook-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
