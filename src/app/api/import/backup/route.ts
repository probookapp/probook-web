import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { withAdmin } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth";
import { validateBody, isValidationError } from "@/lib/validate";
import { backupFileSchema } from "./schema";
import { getDefaultLocationId, recordInitialStock } from "@/lib/stock";
import { computeInvoiceIntegrityHash } from "@/lib/invoice-integrity";

/**
 * Tenant backup restore.
 *
 * Wipes the tenant's data and recreates it from the backup, PRESERVING the
 * original ids so cross-table references stay intact.
 *
 * Everything the export captures is restored, including (since v3.1) users, the
 * full POS history and inline media. Two safety rules bound that reach — both
 * exist so that restoring your own backup can never lock you out of your own
 * tenant:
 *
 *  1. PASSWORDS ARE NEVER OVERWRITTEN on an existing user. A `password_hash`
 *     from the payload is applied ONLY when creating a user that does not exist
 *     yet. Otherwise restoring a month-old backup would silently roll every
 *     password back to its month-old value.
 *  2. THE CALLING ADMIN IS NEVER TOUCHED. Any payload row targeting
 *     ctx.session.userId is skipped, so a restore cannot deactivate, demote or
 *     rename the operator running it.
 *
 * Users are UPSERTED, never deleted: live sessions, POS history and permissions
 * all hang off them, and a backup is not evidence that a user should cease to
 * exist.
 *
 * SAFETY MODEL (audit SALE-22) — restore is wipe-and-replace, so three layers
 * keep a bad file from destroying the tenant:
 *
 *  1. VALIDATE FIRST. The whole payload is structurally validated (./schema.ts)
 *     before anything is touched; a corrupted or truncated file gets a 400 and
 *     the tenant's data is never approached.
 *  2. ONE TRANSACTION. The wipe and the rebuild run inside a single
 *     prisma.$transaction — any failure the validation could not foresee rolls
 *     the tenant back to its exact pre-restore state.
 *  3. RECOMPUTE, DON'T TRUST. Invoice integrity hashes are NEVER copied from
 *     the file: they are recomputed server-side (keyed HMAC) from the restored
 *     fields, for the statuses that carry one (anything issued, i.e. non-DRAFT).
 *     Restoring a faithful backup therefore yields byte-identical hashes, while
 *     a file with doctored figures yields hashes that match the doctored data —
 *     the hash can no longer be used to make tampered numbers look verified.
 */

type Row = Record<string, unknown>;

/** "unit_price" -> "unitPrice" */
function camel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

/**
 * Read a field from a backup row.
 *
 * v3.0 files are snake_case. v2.0 files were serialised straight from Prisma in
 * camelCase, which this route never understood — every scalar silently fell back
 * to a default on restore. Accepting both spellings makes old backups faithful
 * too.
 */
function raw(row: Row, key: string): unknown {
  const v = row[key];
  return v !== undefined ? v : row[camel(key)];
}

/**
 * Empty strings are preserved as-is rather than coerced to null: "" and null are
 * distinct values in the DB, and a restore must hand back exactly what the
 * export captured.
 */
function str(row: Row, key: string): string | null {
  const v = raw(row, key);
  return typeof v === "string" ? v : null;
}

/** For non-null columns; the DB rejects the row if the backup really lacks it. */
function reqStr(row: Row, key: string): string {
  return str(row, key) as string;
}

/** Preserve the original id when present, else let Prisma mint one. */
function idOf(row: Row): string | undefined {
  return str(row, "id") ?? undefined;
}

function num(row: Row, key: string, fallback: number): number {
  const v = raw(row, key);
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function numOrNull(row: Row, key: string): number | null {
  const v = raw(row, key);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function int(row: Row, key: string, fallback: number): number {
  return Math.round(num(row, key, fallback));
}

function bool(row: Row, key: string, fallback = false): boolean {
  const v = raw(row, key);
  return typeof v === "boolean" ? v : fallback;
}

function dateOrNull(row: Row, key: string): Date | null {
  const v = raw(row, key);
  if (typeof v !== "string" && !(v instanceof Date)) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function reqDate(row: Row, key: string): Date {
  return dateOrNull(row, key) ?? new Date();
}

function list(row: Row, key: string): Row[] {
  const v = row[key];
  return Array.isArray(v) ? (v as Row[]) : [];
}

/**
 * Read a media column (logo / photo), rehydrating v3.1 asset references.
 *
 * v3.1 hoists inline images into a deduped, content-addressed `assets` map and
 * leaves "asset:<sha256hex>" in the column. Anything else is passed through
 * verbatim — which is exactly what v2/v3.0 files need, since they carry either
 * a stripped (absent) field or the raw inline base64 with no `asset:` prefix.
 *
 * A reference whose hash is missing from `assets` (hand-edited or truncated
 * file) restores as null rather than failing the entire import: a missing logo
 * is recoverable, a refused restore is not.
 */
function media(row: Row, key: string, assets: Row): string | null {
  const v = str(row, key);
  if (v === null || !v.startsWith("asset:")) return v;
  const hit = assets[v.slice("asset:".length)];
  return typeof hit === "string" ? hit : null;
}

export const POST = withAdmin(async (req: NextRequest, ctx) => {
  const { tenantId } = ctx;

  // Validate the ENTIRE file BEFORE the destructive wipe below: a structurally
  // broken backup must 400 here, with the tenant's data untouched.
  const body = await validateBody(req, backupFileSchema);
  if (isValidationError(body)) return body;

  const imported: Record<string, number> = {};

  try {
    await prisma.$transaction(async (tx) => {
      const src = body as Row;

      const assets = (src.assets ?? {}) as Row;

      // Only a payload exported with ?include_photos=1 describes photos at all.
      // Anything else (lean v3.1 export, or any v2/v3.0 file) says nothing about
      // them, so restore must not treat "no photo here" as "delete the photo".
      const photosAreAuthoritative = src.includes_photos === true;

      const locations = list(src, "locations");
      const users = list(src, "users");
      const categories = list(src, "product_categories");
      const products = list(src, "products");
      const variants = list(src, "product_variants");
      const prices = list(src, "product_prices");
      const clients = list(src, "clients");
      const contacts = list(src, "client_contacts");
      const suppliers = list(src, "suppliers");
      const productSuppliers = list(src, "product_suppliers");
      const registers = list(src, "pos_registers");
      const printerConfigs = list(src, "pos_printer_configs");
      const quotes = list(src, "quotes");
      const invoices = list(src, "invoices");
      const payments = list(src, "payments");
      const deliveryNotes = list(src, "delivery_notes");
      const creditNotes = list(src, "credit_notes");
      const purchaseOrders = list(src, "purchase_orders");
      const supplierPayments = list(src, "supplier_payments");
      const posSessions = list(src, "pos_sessions");
      const posTransactions = list(src, "pos_transactions");
      const posCashMovements = list(src, "pos_cash_movements");
      const stockLevels = list(src, "stock_levels");
      const stockMovements = list(src, "stock_movements");
      const stockTransfers = list(src, "stock_transfers");
      const expenses = list(src, "expenses");
      const reminders = list(src, "reminders");
      const userPermissions = list(src, "user_permissions");

      // ─── 1. Wipe tenant data (exact reverse of the create order below) ───
      await tx.reminder.deleteMany({ where: { tenantId } });
      await tx.expense.deleteMany({ where: { tenantId } });
      await tx.stockTransferLine.deleteMany({
        where: { transfer: { tenantId } },
      });
      await tx.stockTransfer.deleteMany({ where: { tenantId } });
      await tx.stockMovement.deleteMany({ where: { tenantId } });
      await tx.stockLevel.deleteMany({ where: { tenantId } });
      await tx.posCashMovement.deleteMany({ where: { tenantId } });
      await tx.posPayment.deleteMany({ where: { transaction: { tenantId } } });
      await tx.posTransactionLine.deleteMany({
        where: { transaction: { tenantId } },
      });
      await tx.posTransaction.deleteMany({ where: { tenantId } });
      await tx.posSession.deleteMany({ where: { tenantId } });
      await tx.supplierPayment.deleteMany({ where: { tenantId } });
      await tx.purchaseOrderLine.deleteMany({ where: { order: { tenantId } } });
      await tx.purchaseOrder.deleteMany({ where: { tenantId } });
      await tx.creditNoteLine.deleteMany({
        where: { creditNote: { tenantId } },
      });
      await tx.creditNote.deleteMany({ where: { tenantId } });
      await tx.payment.deleteMany({ where: { tenantId } });
      // Snapshot existing product photos BEFORE the wipe. A photo-less backup
      // (the default — photos only ship with ?include_photos=1) carries no
      // photo_path, and wipe-and-replace would otherwise silently destroy the
      // catalogue's images. We re-apply these below for any product the backup
      // restores under the same id and for which it carries no photo of its own.
      // Only consulted when the payload is NOT authoritative about photos.
      const priorPhotos = new Map<string, string>();
      for (const p of await tx.product.findMany({
        where: { tenantId, photoPath: { not: null } },
        select: { id: true, photoPath: true },
      })) {
        if (p.photoPath) priorPhotos.set(p.id, p.photoPath);
      }

      await tx.deliveryNoteLine.deleteMany({
        where: { deliveryNote: { tenantId } },
      });
      await tx.deliveryNote.deleteMany({ where: { tenantId } });
      await tx.invoiceLine.deleteMany({ where: { invoice: { tenantId } } });
      await tx.invoice.deleteMany({ where: { tenantId } });
      await tx.quoteLine.deleteMany({ where: { quote: { tenantId } } });
      await tx.quote.deleteMany({ where: { tenantId } });
      await tx.posPrinterConfig.deleteMany({ where: { tenantId } });
      // v3.0 could not delete registers: PosSession/PosTransaction hold a
      // REQUIRED FK to them (onDelete: Restrict) and were outside the backup, so
      // any tenant with POS history would hard-fail. v3.1 restores POS history
      // and therefore wipes it four lines up, which empties every Restrict FK
      // into pos_registers (sessions, transactions, printer configs and purchase
      // orders are all gone by now) and makes the delete safe. Deleting is also
      // the only correct choice now: an upsert would leave registers the backup
      // has never heard of alive but stripped of all their sessions.
      await tx.posRegister.deleteMany({ where: { tenantId } });
      await tx.productSupplier.deleteMany({ where: { tenantId } });
      await tx.supplier.deleteMany({ where: { tenantId } });
      await tx.clientContact.deleteMany({ where: { tenantId } });
      await tx.client.deleteMany({ where: { tenantId } });
      await tx.productPrice.deleteMany({ where: { tenantId } });
      await tx.productVariant.deleteMany({ where: { tenantId } });
      await tx.product.deleteMany({ where: { tenantId } });
      await tx.productCategory.deleteMany({ where: { tenantId } });
      await tx.location.deleteMany({ where: { tenantId } });
      // Delete non-admin user permissions
      await tx.userPermission.deleteMany({
        where: { user: { tenantId, role: { not: "admin" } } },
      });

      // ─── 2. Locations ───
      if (locations.length) {
        await tx.location.createMany({
          data: locations.map((l) => ({
            id: idOf(l),
            tenantId,
            name: reqStr(l, "name"),
            type: str(l, "type") ?? "store",
            address: str(l, "address"),
            isDefault: bool(l, "is_default"),
            isActive: bool(l, "is_active", true),
            createdAt: reqDate(l, "created_at"),
          })),
        });
        imported.locations = locations.length;
      }

      // ─── 2b. Users ───
      // Restored early: everything below that references a user (POS history,
      // permissions) needs them, and they themselves only need the tenant.
      //
      // UPSERT ON ID, never delete. See the two safety rules in the header:
      // passwords are only ever set when CREATING a user, and the admin running
      // the restore is skipped outright.
      if (users.length) {
        const incomingIds = users
          .map((u) => str(u, "id"))
          .filter((v): v is string => v !== null);

        // Ids are globally unique, so an id already owned by ANOTHER tenant
        // cannot be created here — such a row is skipped, not thrown on, the
        // same way user_permissions tolerates a cross-tenant backup.
        const claimed = incomingIds.length
          ? await tx.user.findMany({
              where: { id: { in: incomingIds } },
              select: { id: true, tenantId: true },
            })
          : [];
        const ownIds = new Set(
          claimed.filter((u) => u.tenantId === tenantId).map((u) => u.id)
        );
        const foreignIds = new Set(
          claimed.filter((u) => u.tenantId !== tenantId).map((u) => u.id)
        );

        // username is unique per (tenantId, username).
        const tenantUsers = await tx.user.findMany({
          where: { tenantId },
          select: { id: true, username: true },
        });
        const idByUsername = new Map(tenantUsers.map((u) => [u.username, u.id]));

        let restored = 0;
        let skipped = 0;

        for (const u of users) {
          const id = str(u, "id");
          const username = str(u, "username");
          if (!id || !username) {
            skipped++;
            continue;
          }

          // ⚠️ SAFETY: never deactivate, demote or rename the admin performing
          // the restore — that is the one change nobody could undo afterwards.
          if (id === ctx.session.userId) {
            skipped++;
            continue;
          }

          // The id belongs to a different tenant: not ours to touch.
          if (foreignIds.has(id)) {
            skipped++;
            continue;
          }

          // The username is already taken by a DIFFERENT user of this tenant.
          // Writing it would violate @@unique([tenantId, username]) and abort
          // the whole restore, so drop just this row.
          const holder = idByUsername.get(username);
          if (holder !== undefined && holder !== id) {
            skipped++;
            continue;
          }

          const data = {
            username,
            displayName: reqStr(u, "display_name"),
            email: str(u, "email"),
            emailVerified: bool(u, "email_verified"),
            role: str(u, "role") ?? "employee",
            isActive: bool(u, "is_active", true),
            createdAt: reqDate(u, "created_at"),
          };

          if (ownIds.has(id)) {
            // ⚠️ SAFETY: passwordHash is deliberately absent from `data`. The
            // user already exists and their CURRENT password must keep working;
            // restoring a backup is not a password rollback.
            await tx.user.update({ where: { id }, data });
          } else {
            // Creating: the payload hash is used when present (encrypted export,
            // ?include_secrets=1). A plain export carries none, so the account is
            // created with an unusable random password — it exists for the FKs
            // and can only be entered through the forgot-password flow. Never
            // blank, never guessable.
            const passwordHash =
              str(u, "password_hash") ??
              (await hashPassword(randomBytes(32).toString("base64url")));
            await tx.user.create({ data: { id, tenantId, passwordHash, ...data } });
            ownIds.add(id);
          }
          idByUsername.set(username, id);
          restored++;
        }

        if (restored) imported.users = restored;
        if (skipped) imported.users_skipped = skipped;
      }

      // ─── 3. Product categories ───
      if (categories.length) {
        // parentId is applied in a second pass: a child may precede its parent
        // in the file and the self-FK is checked row by row.
        await tx.productCategory.createMany({
          data: categories.map((c) => ({
            id: idOf(c),
            tenantId,
            name: reqStr(c, "name"),
            description: str(c, "description"),
            createdAt: reqDate(c, "created_at"),
          })),
        });
        for (const c of categories) {
          const id = str(c, "id");
          const parentId = str(c, "parent_id");
          if (id && parentId) {
            await tx.productCategory.update({
              where: { id },
              data: { parentId },
            });
          }
        }
        imported.product_categories = categories.length;
      }

      // ─── 4. Products ───
      if (products.length) {
        await tx.product.createMany({
          data: products.map((p) => ({
            id: idOf(p),
            tenantId,
            designation: reqStr(p, "designation"),
            description: str(p, "description"),
            descriptionHtml: str(p, "description_html"),
            unitPrice: num(p, "unit_price", 0),
            taxRate: num(p, "tax_rate", 20),
            unit: str(p, "unit") ?? "unit",
            reference: str(p, "reference"),
            barcode: str(p, "barcode"),
            isService: bool(p, "is_service"),
            categoryId: str(p, "category_id"),
            quantity: int(p, "quantity", 0),
            purchasePrice: num(p, "purchase_price", 0),
            hasVariants: bool(p, "has_variants"),
            // Photos only ship with ?include_photos=1.
            //  - includes_photos=true  -> the backup is authoritative: take it
            //    verbatim, so a deleted photo (or an orphaned asset ref) nulls.
            //  - otherwise -> the backup carries no photo data at all, so keep
            //    whatever the product already had; a lean backup must not
            //    destroy the catalogue's images. Any inline base64 from a
            //    v2/v3.0 payload still wins over the preserved value.
            photoPath: photosAreAuthoritative
              ? media(p, "photo_path", assets) ?? null
              : media(p, "photo_path", assets) ??
                priorPhotos.get(idOf(p) ?? "") ??
                null,
            createdAt: reqDate(p, "created_at"),
          })),
        });
        imported.products = products.length;
      }

      // ─── 5. Product variants ───
      if (variants.length) {
        await tx.productVariant.createMany({
          data: variants.map((v) => ({
            id: idOf(v),
            tenantId,
            productId: reqStr(v, "product_id"),
            name: reqStr(v, "name"),
            sku: str(v, "sku"),
            barcode: str(v, "barcode"),
            attributes: (raw(v, "attributes") ?? {}) as Prisma.InputJsonValue,
            quantity: int(v, "quantity", 0),
            priceOverride: numOrNull(v, "price_override"),
            isActive: bool(v, "is_active", true),
            createdAt: reqDate(v, "created_at"),
          })),
        });
        imported.product_variants = variants.length;
      }

      // ─── 6. Product prices ───
      if (prices.length) {
        await tx.productPrice.createMany({
          data: prices.map((p) => ({
            id: idOf(p),
            tenantId,
            productId: reqStr(p, "product_id"),
            label: reqStr(p, "label"),
            price: num(p, "price", 0),
            createdAt: reqDate(p, "created_at"),
          })),
        });
        imported.product_prices = prices.length;
      }

      // ─── 7. Clients ───
      if (clients.length) {
        await tx.client.createMany({
          data: clients.map((c) => ({
            id: idOf(c),
            tenantId,
            name: reqStr(c, "name"),
            email: str(c, "email"),
            phone: str(c, "phone"),
            address: str(c, "address"),
            city: str(c, "city"),
            postalCode: str(c, "postal_code"),
            country: str(c, "country"),
            siret: str(c, "siret"),
            vatNumber: str(c, "vat_number"),
            notes: str(c, "notes"),
            createdAt: reqDate(c, "created_at"),
          })),
        });
        imported.clients = clients.length;
      }

      // ─── 8. Client contacts ───
      if (contacts.length) {
        await tx.clientContact.createMany({
          data: contacts.map((c) => ({
            id: idOf(c),
            tenantId,
            clientId: reqStr(c, "client_id"),
            name: reqStr(c, "name"),
            role: str(c, "role"),
            email: str(c, "email"),
            phone: str(c, "phone"),
            isPrimary: bool(c, "is_primary"),
            createdAt: reqDate(c, "created_at"),
          })),
        });
        imported.client_contacts = contacts.length;
      }

      // ─── 9. Suppliers + product-supplier links ───
      if (suppliers.length) {
        await tx.supplier.createMany({
          data: suppliers.map((s) => ({
            id: idOf(s),
            tenantId,
            name: reqStr(s, "name"),
            email: str(s, "email"),
            phone: str(s, "phone"),
            address: str(s, "address"),
            notes: str(s, "notes"),
            createdAt: reqDate(s, "created_at"),
          })),
        });
        imported.suppliers = suppliers.length;
      }

      if (productSuppliers.length) {
        await tx.productSupplier.createMany({
          data: productSuppliers.map((ps) => ({
            id: idOf(ps),
            tenantId,
            productId: reqStr(ps, "product_id"),
            supplierId: reqStr(ps, "supplier_id"),
            purchasePrice: num(ps, "purchase_price", 0),
            createdAt: reqDate(ps, "created_at"),
          })),
        });
        imported.product_suppliers = productSuppliers.length;
      }

      // ─── 10. POS registers ───
      // v3.0 had to upsert these instead of wiping them, because the POS history
      // holding a Restrict FK to them was outside the backup. v3.1 restores that
      // history, so registers are now wiped and recreated like every other table
      // — see the note on the delete.
      if (registers.length) {
        await tx.posRegister.createMany({
          data: registers.map((r) => ({
            id: idOf(r),
            tenantId,
            name: reqStr(r, "name"),
            location: str(r, "location"),
            isActive: bool(r, "is_active", true),
            locationId: str(r, "location_id"),
            createdAt: reqDate(r, "created_at"),
          })),
        });
        imported.pos_registers = registers.length;
      }

      // ─── 10b. POS printer configs ───
      // registerId resolves against the registers restored just above.
      if (printerConfigs.length) {
        await tx.posPrinterConfig.createMany({
          data: printerConfigs.map((p) => ({
            id: idOf(p),
            tenantId,
            registerId: str(p, "register_id"),
            printerName: reqStr(p, "printer_name"),
            connectionType: reqStr(p, "connection_type"),
            connectionAddress: reqStr(p, "connection_address"),
            paperWidth: int(p, "paper_width", 80),
            isDefault: bool(p, "is_default"),
            isActive: bool(p, "is_active", true),
            createdAt: reqDate(p, "created_at"),
          })),
        });
        imported.pos_printer_configs = printerConfigs.length;
      }

      // ─── 11. Quotes (+lines) ───
      for (const q of quotes) {
        const lines = list(q, "lines");
        await tx.quote.create({
          data: {
            id: idOf(q),
            tenantId,
            quoteNumber: reqStr(q, "quote_number"),
            clientId: reqStr(q, "client_id"),
            status: str(q, "status") ?? "DRAFT",
            issueDate: reqDate(q, "issue_date"),
            validityDate: reqDate(q, "validity_date"),
            subtotal: num(q, "subtotal", 0),
            taxAmount: num(q, "tax_amount", 0),
            total: num(q, "total", 0),
            notes: str(q, "notes"),
            notesHtml: str(q, "notes_html"),
            shippingCost: num(q, "shipping_cost", 0),
            shippingTaxRate: num(q, "shipping_tax_rate", 20),
            downPaymentPercent: num(q, "down_payment_percent", 0),
            downPaymentAmount: num(q, "down_payment_amount", 0),
            // The logo frozen at send time — the document must re-render exactly
            // as it was issued, not with today's logo.
            logoSnapshot: media(q, "logo_snapshot", assets),
            createdAt: reqDate(q, "created_at"),
            lines: {
              createMany: {
                data: lines.map((l) => ({
                  id: idOf(l),
                  productId: str(l, "product_id"),
                  description: reqStr(l, "description"),
                  descriptionHtml: str(l, "description_html"),
                  quantity: num(l, "quantity", 0),
                  unitPrice: num(l, "unit_price", 0),
                  taxRate: num(l, "tax_rate", 0),
                  subtotal: num(l, "subtotal", 0),
                  taxAmount: num(l, "tax_amount", 0),
                  total: num(l, "total", 0),
                  position: int(l, "position", 0),
                  groupName: str(l, "group_name"),
                  isSubtotalLine: bool(l, "is_subtotal_line"),
                })),
              },
            },
          },
        });
      }
      if (quotes.length) imported.quotes = quotes.length;

      // ─── 12. Invoices (+lines) ───
      for (const inv of invoices) {
        const lines = list(inv, "lines");

        // Every scalar that feeds the integrity hash is resolved ONCE, so the
        // hash is provably computed over exactly what gets written.
        const invoiceNumber = reqStr(inv, "invoice_number");
        const clientId = reqStr(inv, "client_id");
        const status = str(inv, "status") ?? "DRAFT";
        const issueDate = reqDate(inv, "issue_date");
        const dueDate = reqDate(inv, "due_date");
        const subtotal = num(inv, "subtotal", 0);
        const taxAmount = num(inv, "tax_amount", 0);
        const total = num(inv, "total", 0);
        const shippingCost = num(inv, "shipping_cost", 0);
        const stampDuty = num(inv, "stamp_duty", 0);
        const isCashSale = bool(inv, "is_cash_sale");
        const stampDutyExempt = bool(inv, "stamp_duty_exempt");

        // ⚠️ NEVER write the file's integrity_hash (audit SALE-22): recompute
        // it from the restored fields instead, exactly as the issue route does
        // (same field set, same position ordering, same keyed HMAC). Only a
        // DRAFT has no hash — issuing is the sole transition out of DRAFT and
        // it always stamps one. A faithful backup round-trips byte-identically;
        // a doctored one gets a hash that matches its doctored figures, so the
        // hash cannot be forged to whitewash tampered data.
        const integrityHash =
          status === "DRAFT"
            ? null
            : computeInvoiceIntegrityHash({
                invoiceNumber,
                clientId,
                issueDate,
                dueDate,
                subtotal,
                taxAmount,
                total,
                shippingCost,
                stampDuty,
                isCashSale,
                stampDutyExempt,
                lines: [...lines]
                  .sort((a, b) => int(a, "position", 0) - int(b, "position", 0))
                  .map((l) => ({
                    description: reqStr(l, "description"),
                    quantity: num(l, "quantity", 0),
                    unitPrice: num(l, "unit_price", 0),
                    taxRate: num(l, "tax_rate", 0),
                    subtotal: num(l, "subtotal", 0),
                    total: num(l, "total", 0),
                  })),
              });

        await tx.invoice.create({
          data: {
            id: idOf(inv),
            tenantId,
            invoiceNumber,
            clientId,
            quoteId: str(inv, "quote_id"),
            status,
            issueDate,
            dueDate,
            subtotal,
            taxAmount,
            total,
            notes: str(inv, "notes"),
            notesHtml: str(inv, "notes_html"),
            integrityHash,
            // Timbre inputs frozen on the invoice — they feed the hash above,
            // so dropping them (as pre-SALE-22 restores did) would both lose
            // data and break verification for cash-sale invoices.
            isCashSale,
            stampDutyExempt,
            // Offline-replay dedupe key: restored verbatim so a queued retry
            // from before the backup still cannot double-create the document.
            idempotencyKey: str(inv, "idempotency_key"),
            shippingCost,
            shippingTaxRate: num(inv, "shipping_tax_rate", 20),
            downPaymentPercent: num(inv, "down_payment_percent", 0),
            downPaymentAmount: num(inv, "down_payment_amount", 0),
            isDownPaymentInvoice: bool(inv, "is_down_payment_invoice"),
            parentQuoteId: str(inv, "parent_quote_id"),
            // Droit de timbre snapshotted at issue time — must survive a restore.
            stampDuty,
            // The logo frozen at issue time — see the quote note above.
            logoSnapshot: media(inv, "logo_snapshot", assets),
            createdAt: reqDate(inv, "created_at"),
            lines: {
              createMany: {
                data: lines.map((l) => ({
                  id: idOf(l),
                  productId: str(l, "product_id"),
                  description: reqStr(l, "description"),
                  descriptionHtml: str(l, "description_html"),
                  quantity: num(l, "quantity", 0),
                  unitPrice: num(l, "unit_price", 0),
                  taxRate: num(l, "tax_rate", 0),
                  subtotal: num(l, "subtotal", 0),
                  taxAmount: num(l, "tax_amount", 0),
                  total: num(l, "total", 0),
                  position: int(l, "position", 0),
                  groupName: str(l, "group_name"),
                  isSubtotalLine: bool(l, "is_subtotal_line"),
                  // Frozen COGS basis captured at issue time — restoring it as
                  // 0 would silently rewrite every profit/margin report.
                  costPriceSnapshot: num(l, "cost_price_snapshot", 0),
                })),
              },
            },
          },
        });
      }
      if (invoices.length) imported.invoices = invoices.length;

      // ─── 13. Payments ───
      if (payments.length) {
        await tx.payment.createMany({
          data: payments.map((p) => ({
            id: idOf(p),
            tenantId,
            invoiceId: reqStr(p, "invoice_id"),
            amount: num(p, "amount", 0),
            paymentDate: reqDate(p, "payment_date"),
            paymentMethod: reqStr(p, "payment_method"),
            reference: str(p, "reference"),
            notes: str(p, "notes"),
            createdAt: reqDate(p, "created_at"),
          })),
        });
        imported.payments = payments.length;
      }

      // ─── 14. Delivery notes (+lines) ───
      for (const dn of deliveryNotes) {
        const lines = list(dn, "lines");
        await tx.deliveryNote.create({
          data: {
            id: idOf(dn),
            tenantId,
            deliveryNoteNumber: reqStr(dn, "delivery_note_number"),
            clientId: reqStr(dn, "client_id"),
            quoteId: str(dn, "quote_id"),
            invoiceId: str(dn, "invoice_id"),
            status: str(dn, "status") ?? "DRAFT",
            issueDate: reqDate(dn, "issue_date"),
            deliveryDate: dateOrNull(dn, "delivery_date"),
            deliveryAddress: str(dn, "delivery_address"),
            notes: str(dn, "notes"),
            notesHtml: str(dn, "notes_html"),
            createdAt: reqDate(dn, "created_at"),
            lines: {
              createMany: {
                data: lines.map((l) => ({
                  id: idOf(l),
                  productId: str(l, "product_id"),
                  description: reqStr(l, "description"),
                  descriptionHtml: str(l, "description_html"),
                  quantity: num(l, "quantity", 0),
                  unit: str(l, "unit"),
                  position: int(l, "position", 0),
                  createdAt: reqDate(l, "created_at"),
                })),
              },
            },
          },
        });
      }
      if (deliveryNotes.length) imported.delivery_notes = deliveryNotes.length;

      // ─── 15. Credit notes (+lines) ───
      for (const cn of creditNotes) {
        const lines = list(cn, "lines");
        await tx.creditNote.create({
          data: {
            id: idOf(cn),
            tenantId,
            creditNoteNumber: reqStr(cn, "credit_note_number"),
            invoiceId: str(cn, "invoice_id"),
            clientId: reqStr(cn, "client_id"),
            status: str(cn, "status") ?? "ISSUED",
            issueDate: reqDate(cn, "issue_date"),
            reason: str(cn, "reason"),
            subtotal: num(cn, "subtotal", 0),
            taxAmount: num(cn, "tax_amount", 0),
            total: num(cn, "total", 0),
            restocked: bool(cn, "restocked"),
            notes: str(cn, "notes"),
            createdAt: reqDate(cn, "created_at"),
            lines: {
              createMany: {
                data: lines.map((l) => ({
                  id: idOf(l),
                  productId: str(l, "product_id"),
                  variantId: str(l, "variant_id"),
                  description: reqStr(l, "description"),
                  quantity: num(l, "quantity", 0),
                  unitPrice: num(l, "unit_price", 0),
                  taxRate: num(l, "tax_rate", 0),
                  subtotal: num(l, "subtotal", 0),
                  taxAmount: num(l, "tax_amount", 0),
                  total: num(l, "total", 0),
                })),
              },
            },
          },
        });
      }
      if (creditNotes.length) imported.credit_notes = creditNotes.length;

      // ─── 16. Purchase orders (+lines) ───
      // `session_id` is a plain String (no FK to pos_sessions), so it is safe to
      // keep verbatim. `register_id` IS an FK — hence step 10.
      for (const po of purchaseOrders) {
        const lines = list(po, "lines");
        await tx.purchaseOrder.create({
          data: {
            id: idOf(po),
            tenantId,
            orderNumber: reqStr(po, "order_number"),
            supplierId: reqStr(po, "supplier_id"),
            status: str(po, "status") ?? "PENDING",
            orderDate: reqDate(po, "order_date"),
            confirmedDate: dateOrNull(po, "confirmed_date"),
            paidFromRegister: bool(po, "paid_from_register"),
            registerId: str(po, "register_id"),
            sessionId: str(po, "session_id"),
            paymentStatus: str(po, "payment_status") ?? "UNPAID",
            subtotal: num(po, "subtotal", 0),
            taxAmount: num(po, "tax_amount", 0),
            total: num(po, "total", 0),
            notes: str(po, "notes"),
            locationId: str(po, "location_id"),
            createdAt: reqDate(po, "created_at"),
            lines: {
              createMany: {
                data: lines.map((l) => ({
                  id: idOf(l),
                  productId: reqStr(l, "product_id"),
                  variantId: str(l, "variant_id"),
                  quantity: num(l, "quantity", 0),
                  receivedQuantity: num(l, "received_quantity", 0),
                  unitPrice: num(l, "unit_price", 0),
                  previousPrice: numOrNull(l, "previous_price"),
                  useAveragePrice: bool(l, "use_average_price"),
                  subtotal: num(l, "subtotal", 0),
                  taxRate: num(l, "tax_rate", 0),
                  taxAmount: num(l, "tax_amount", 0),
                  total: num(l, "total", 0),
                })),
              },
            },
          },
        });
      }
      if (purchaseOrders.length) imported.purchase_orders = purchaseOrders.length;

      // ─── 17. Supplier payments ───
      if (supplierPayments.length) {
        await tx.supplierPayment.createMany({
          data: supplierPayments.map((p) => ({
            id: idOf(p),
            tenantId,
            supplierId: reqStr(p, "supplier_id"),
            purchaseOrderId: str(p, "purchase_order_id"),
            amount: num(p, "amount", 0),
            paymentDate: reqDate(p, "payment_date"),
            paymentMethod: str(p, "payment_method") ?? "CASH",
            reference: str(p, "reference"),
            notes: str(p, "notes"),
            createdAt: reqDate(p, "created_at"),
          })),
        });
        imported.supplier_payments = supplierPayments.length;
      }

      // ─── 17b. POS history ───
      // Restorable at last, now that users exist. Every one of these rows has a
      // REQUIRED FK to a user, and sessions/transactions additionally require a
      // register.
      //
      // ROBUSTNESS: rather than trusting the payload, each row is checked
      // against the ids that actually exist after the restore, and skipped if a
      // required parent is missing — mirroring the user_permissions pattern. A
      // partial or cross-tenant backup (or one whose users were skipped by the
      // safety rules above) then degrades to "fewer POS rows" instead of
      // FK-failing the entire import. Optional FKs (client, invoice, product,
      // variant) are passed through: they come from the same payload.
      if (posSessions.length || posTransactions.length || posCashMovements.length) {
        const [tenantUsers, tenantRegisters] = await Promise.all([
          tx.user.findMany({ where: { tenantId }, select: { id: true } }),
          tx.posRegister.findMany({ where: { tenantId }, select: { id: true } }),
        ]);
        const userIds = new Set(tenantUsers.map((u) => u.id));
        const registerIds = new Set(tenantRegisters.map((r) => r.id));

        const hasUser = (row: Row) => {
          const id = str(row, "user_id");
          return id !== null && userIds.has(id);
        };
        const hasRegister = (row: Row) => {
          const id = str(row, "register_id");
          return id !== null && registerIds.has(id);
        };

        // ─── 17b-i. POS sessions ───
        const restorableSessions = posSessions.filter(
          (s) => idOf(s) !== undefined && hasUser(s) && hasRegister(s)
        );
        if (restorableSessions.length) {
          await tx.posSession.createMany({
            data: restorableSessions.map((s) => ({
              id: idOf(s),
              tenantId,
              registerId: reqStr(s, "register_id"),
              userId: reqStr(s, "user_id"),
              openedAt: reqDate(s, "opened_at"),
              closedAt: dateOrNull(s, "closed_at"),
              openingFloat: num(s, "opening_float", 0),
              expectedCash: numOrNull(s, "expected_cash"),
              actualCash: numOrNull(s, "actual_cash"),
              cashDifference: numOrNull(s, "cash_difference"),
              status: str(s, "status") ?? "OPEN",
              notes: str(s, "notes"),
              createdAt: reqDate(s, "created_at"),
            })),
          });
          imported.pos_sessions = restorableSessions.length;
        }
        // Children of a skipped session must be skipped too.
        const sessionIds = new Set(
          restorableSessions.map((s) => str(s, "id") as string)
        );
        const hasSession = (row: Row) => {
          const id = str(row, "session_id");
          return id !== null && sessionIds.has(id);
        };

        // ─── 17c. POS transactions (+lines, +payments) ───
        const restorableTx = posTransactions.filter(
          (t) => hasUser(t) && hasRegister(t) && hasSession(t)
        );
        for (const t of restorableTx) {
          const lines = list(t, "lines");
          const txPayments = list(t, "payments");
          await tx.posTransaction.create({
            data: {
              id: idOf(t),
              tenantId,
              ticketNumber: reqStr(t, "ticket_number"),
              registerId: reqStr(t, "register_id"),
              sessionId: reqStr(t, "session_id"),
              clientId: str(t, "client_id"),
              userId: reqStr(t, "user_id"),
              invoiceId: str(t, "invoice_id"),
              transactionDate: reqDate(t, "transaction_date"),
              subtotal: num(t, "subtotal", 0),
              taxAmount: num(t, "tax_amount", 0),
              total: num(t, "total", 0),
              discountPercent: num(t, "discount_percent", 0),
              discountAmount: num(t, "discount_amount", 0),
              finalAmount: num(t, "final_amount", 0),
              status: str(t, "status") ?? "COMPLETED",
              notes: str(t, "notes"),
              createdAt: reqDate(t, "created_at"),
              lines: {
                createMany: {
                  data: lines.map((l) => ({
                    id: idOf(l),
                    productId: str(l, "product_id"),
                    variantId: str(l, "variant_id"),
                    barcode: str(l, "barcode"),
                    designation: reqStr(l, "designation"),
                    quantity: num(l, "quantity", 0),
                    unitPrice: num(l, "unit_price", 0),
                    taxRate: num(l, "tax_rate", 0),
                    subtotal: num(l, "subtotal", 0),
                    taxAmount: num(l, "tax_amount", 0),
                    total: num(l, "total", 0),
                    discountPercent: num(l, "discount_percent", 0),
                    position: int(l, "position", 0),
                    // Frozen COGS basis captured at sale time — restoring it as
                    // 0 would silently rewrite every POS margin report.
                    costPriceSnapshot: num(l, "cost_price_snapshot", 0),
                    createdAt: reqDate(l, "created_at"),
                  })),
                },
              },
              payments: {
                createMany: {
                  data: txPayments.map((p) => ({
                    id: idOf(p),
                    paymentMethod: reqStr(p, "payment_method"),
                    amount: num(p, "amount", 0),
                    cashGiven: numOrNull(p, "cash_given"),
                    changeGiven: numOrNull(p, "change_given"),
                    cardReference: str(p, "card_reference"),
                    createdAt: reqDate(p, "created_at"),
                  })),
                },
              },
            },
          });
        }
        if (restorableTx.length) imported.pos_transactions = restorableTx.length;

        // ─── 17d. POS cash movements ───
        const restorableMovements = posCashMovements.filter(
          (m) => hasUser(m) && hasSession(m)
        );
        if (restorableMovements.length) {
          await tx.posCashMovement.createMany({
            data: restorableMovements.map((m) => ({
              id: idOf(m),
              tenantId,
              sessionId: reqStr(m, "session_id"),
              userId: reqStr(m, "user_id"),
              movementType: reqStr(m, "movement_type"),
              amount: num(m, "amount", 0),
              reason: reqStr(m, "reason"),
              reference: str(m, "reference"),
              createdAt: reqDate(m, "created_at"),
            })),
          });
          imported.pos_cash_movements = restorableMovements.length;
        }
      }

      // ─── 18. Stock levels ───
      if (stockLevels.length) {
        // v3.0: restore the real per-location split verbatim.
        await tx.stockLevel.createMany({
          data: stockLevels.map((s) => ({
            id: idOf(s),
            tenantId,
            locationId: reqStr(s, "location_id"),
            productId: reqStr(s, "product_id"),
            variantId: str(s, "variant_id"),
            quantity: int(s, "quantity", 0),
          })),
        });
        imported.stock_levels = stockLevels.length;
      } else if (products.length) {
        // v2.0 back-compat: those backups carry no locations/stock_levels, so
        // rebuild default-location levels from each product's aggregate
        // quantity, keeping the restored tenant consistent with the
        // multi-location stock engine (aggregate == sum of per-location levels).
        // Only runs when the backup has NO stock_levels — doing it for a v3 file
        // would double-write and collapse the real split onto one location.
        const locationId = await getDefaultLocationId(tx, tenantId);
        for (const p of products) {
          const quantity = int(p, "quantity", 0);
          if (bool(p, "is_service") || quantity <= 0) continue;
          await recordInitialStock(tx, {
            tenantId,
            productId: reqStr(p, "id"),
            locationId,
            quantity,
            referenceType: "backup_restore",
          });
        }
      }

      // ─── 19. Stock movements (ledger, verbatim incl. created_at ordering) ───
      // `user_id` is a plain String (no FK to users), so it survives the restore
      // even though users are never recreated.
      if (stockMovements.length) {
        await tx.stockMovement.createMany({
          data: stockMovements.map((m) => ({
            id: idOf(m),
            tenantId,
            productId: reqStr(m, "product_id"),
            variantId: str(m, "variant_id"),
            type: reqStr(m, "type"),
            quantityChange: int(m, "quantity_change", 0),
            balanceAfter: int(m, "balance_after", 0),
            reason: str(m, "reason"),
            referenceType: str(m, "reference_type"),
            referenceId: str(m, "reference_id"),
            userId: str(m, "user_id"),
            locationId: str(m, "location_id"),
            createdAt: reqDate(m, "created_at"),
          })),
        });
        imported.stock_movements = stockMovements.length;
      }

      // ─── 20. Stock transfers (+lines) ───
      // `created_by` is a plain String (no FK to users) — safe to keep.
      for (const t of stockTransfers) {
        const lines = list(t, "lines");
        await tx.stockTransfer.create({
          data: {
            id: idOf(t),
            tenantId,
            transferNumber: reqStr(t, "transfer_number"),
            fromLocationId: reqStr(t, "from_location_id"),
            toLocationId: reqStr(t, "to_location_id"),
            status: str(t, "status") ?? "completed",
            notes: str(t, "notes"),
            createdBy: str(t, "created_by"),
            createdAt: reqDate(t, "created_at"),
            lines: {
              createMany: {
                data: lines.map((l) => ({
                  id: idOf(l),
                  productId: reqStr(l, "product_id"),
                  variantId: str(l, "variant_id"),
                  quantity: int(l, "quantity", 0),
                })),
              },
            },
          },
        });
      }
      if (stockTransfers.length) imported.stock_transfers = stockTransfers.length;

      // ─── 21. Expenses ───
      if (expenses.length) {
        await tx.expense.createMany({
          data: expenses.map((e) => ({
            id: idOf(e),
            tenantId,
            name: reqStr(e, "name"),
            amount: num(e, "amount", 0),
            date: reqDate(e, "date"),
            notes: str(e, "notes"),
            createdAt: reqDate(e, "created_at"),
          })),
        });
        imported.expenses = expenses.length;
      }

      // ─── 22. Reminders ───
      if (reminders.length) {
        await tx.reminder.createMany({
          data: reminders.map((r) => ({
            id: idOf(r),
            tenantId,
            reminderType: reqStr(r, "reminder_type"),
            documentType: reqStr(r, "document_type"),
            documentId: reqStr(r, "document_id"),
            scheduledDate: reqDate(r, "scheduled_date"),
            sentAt: dateOrNull(r, "sent_at"),
            message: str(r, "message"),
            createdAt: reqDate(r, "created_at"),
          })),
        });
        imported.reminders = reminders.length;
      }

      // ─── 23. Company settings ───
      const s = src.settings as Row | null | undefined;
      if (s) {
        const layout = raw(s, "dashboard_layout");
        const data = {
          companyName: str(s, "company_name") ?? "My Company",
          address: str(s, "address"),
          city: str(s, "city"),
          postalCode: str(s, "postal_code"),
          country: str(s, "country"),
          phone: str(s, "phone"),
          email: str(s, "email"),
          website: str(s, "website"),
          siret: str(s, "siret"),
          vatNumber: str(s, "vat_number"),
          logoPath: media(s, "logo_path", assets),
          defaultTaxRate: num(s, "default_tax_rate", 20),
          defaultPaymentTerms: int(s, "default_payment_terms", 30),
          invoicePrefix: str(s, "invoice_prefix") ?? "INV-",
          quotePrefix: str(s, "quote_prefix") ?? "QT-",
          nextInvoiceNumber: int(s, "next_invoice_number", 1),
          nextQuoteNumber: int(s, "next_quote_number", 1),
          legalMentions: str(s, "legal_mentions"),
          legalMentionsHtml: str(s, "legal_mentions_html"),
          bankDetails: str(s, "bank_details"),
          deliveryNotePrefix: str(s, "delivery_note_prefix") ?? "DN-",
          nextDeliveryNoteNumber: int(s, "next_delivery_note_number", 1),
          appLanguage: str(s, "app_language") ?? "en",
          appTheme: str(s, "app_theme") ?? "light",
          currency: str(s, "currency") ?? "EUR",
          posTicketPrefix: str(s, "pos_ticket_prefix") ?? "TK-",
          posAutoPrintReceipt: bool(s, "pos_auto_print_receipt", true),
          posShowStockWarning: bool(s, "pos_show_stock_warning", true),
          posLowStockThreshold: int(s, "pos_low_stock_threshold", 5),
          creditNotePrefix: str(s, "credit_note_prefix") ?? "CN-",
          nextCreditNoteNumber: int(s, "next_credit_note_number", 1),
          dashboardLayout: (layout ?? Prisma.DbNull) as
            | Prisma.NullableJsonNullValueInput
            | Prisma.InputJsonValue,
          stampDutyEnabled: bool(s, "stamp_duty_enabled"),
          stampDutyRate: num(s, "stamp_duty_rate", 1.0),
          // Was silently dropped before SALE-22: a restore reset the timbre
          // threshold to 0, turning the duty on for every cash sale.
          stampDutyThreshold: num(s, "stamp_duty_threshold", 0),
        };
        await tx.companySettings.upsert({
          where: { tenantId },
          update: data,
          create: { tenantId, ...data },
        });
        imported.settings = 1;
      }

      // ─── 24. User permissions ───
      // Users are upserted (step 2b) and never deleted, so their ids exist by
      // now and these rows can be re-attached. Without this the restore would
      // wipe every employee's module access and CRUD flags for good (the delete
      // above ran, but nothing ever put them back).
      //
      // Scoped to NON-admin users of THIS tenant, mirroring the delete exactly:
      // admins are implicitly all-access, and filtering to ids we actually own
      // stops a backup taken from a different tenant from FK-failing. Rows
      // referencing unknown users are skipped silently rather than erroring.
      if (userPermissions.length) {
        const eligible = await tx.user.findMany({
          where: { tenantId, role: { not: "admin" } },
          select: { id: true },
        });
        const eligibleIds = new Set(eligible.map((u) => u.id));

        const restorable = userPermissions.filter((p) => {
          const userId = str(p, "user_id");
          return userId !== null && eligibleIds.has(userId);
        });

        if (restorable.length) {
          await tx.userPermission.createMany({
            data: restorable.map((p) => ({
              id: idOf(p),
              userId: reqStr(p, "user_id"),
              permissionKey: reqStr(p, "permission_key"),
              granted: bool(p, "granted", true),
              canView: bool(p, "can_view", true),
              canCreate: bool(p, "can_create", true),
              canEdit: bool(p, "can_edit", true),
              canDelete: bool(p, "can_delete", true),
            })),
          });
          imported.user_permissions = restorable.length;
        }
      }
    }, {
      // A full restore does hundreds of sequential writes; the default 5s
      // interactive-transaction timeout would roll back any real-sized backup.
      timeout: 120000,
      maxWait: 30000,
    });

    return NextResponse.json({ success: true, imported });
  } catch (error) {
    // Log the real cause server-side; don't leak raw DB/Prisma internals to the client.
    console.error("Backup import error:", error);
    return NextResponse.json(
      { error: "Import failed. The backup file may be invalid or too large." },
      { status: 500 }
    );
  }
});
