import { z } from "zod";

/**
 * Structural validation for the backup restore payload (audit SALE-22).
 *
 * The restore wipes the ENTIRE tenant dataset before rebuilding it, so the
 * whole file is validated HERE, up front: a truncated, hand-edited or otherwise
 * corrupted backup must be refused with a 400 BEFORE a single row is deleted.
 * (The wipe+rebuild itself is additionally wrapped in one transaction, so even
 * a failure this validation cannot foresee — an FK to a row the file never
 * carried, say — rolls back to the pre-restore state.)
 *
 * Philosophy: mirror the loader in route.ts exactly.
 *
 *  - Everything the loader has a safe fallback for stays OPTIONAL here
 *    (missing dates fall back, missing numbers default, media refs degrade to
 *    null, POS rows with unknown parents are skipped, ...).
 *  - Everything that would CRASH the rebuild mid-transaction — a required
 *    string handed to Prisma as null, a row that is not an object, a duplicate
 *    primary key, a table that is not an array — is rejected here instead.
 *  - A field that IS present must have the right primitive type. The loader
 *    would silently coerce a mistyped value to its fallback (unit_price: "x"
 *    restores as 0), which is data corruption, not tolerance.
 *
 * Field names are validated under BOTH spellings (snake_case v3 files,
 * camelCase v2 files), exactly like the loader's `raw()`.
 */

type Row = Record<string, unknown>;

/** Stop collecting after this many issues — enough to diagnose, not a flood. */
const MAX_ISSUES = 25;

/** "unit_price" -> "unitPrice" (must match route.ts). */
function camel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

/** Read a field under either spelling, like the loader's raw(). */
function read(row: Row, key: string): unknown {
  const v = row[key];
  return v !== undefined ? v : row[camel(key)];
}

function isPlainObject(v: unknown): v is Row {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Field kinds. A trailing "!" marks the field REQUIRED (the loader feeds it to
 * a non-nullable Prisma column via reqStr and would crash without it).
 *
 *  - string / boolean / json: plain typeof checks; json accepts anything.
 *  - number: any finite number (JSON cannot encode NaN/Infinity anyway).
 *  - count:  a finite number >= 0 (document counters — a negative counter
 *            would corrupt future numbering).
 *  - date:   a string that parses to a valid Date. The loader tolerates a
 *            MISSING date (falls back), so dates are never required — but a
 *            present-yet-unparseable one is evidence of corruption.
 */
type Kind = "string" | "number" | "count" | "boolean" | "date" | "json";
type FieldSpec = Kind | `${Kind}!`;

interface TableSpec {
  fields: Record<string, FieldSpec>;
  /** Nested child-row arrays created alongside the parent (lines, payments). */
  children?: Record<string, Record<string, FieldSpec>>;
}

interface Issue {
  path: (string | number)[];
  message: string;
}

function typeError(kind: Kind, v: unknown): string | null {
  switch (kind) {
    case "string":
      return typeof v === "string" ? null : "must be a string";
    case "number":
      return typeof v === "number" && Number.isFinite(v)
        ? null
        : "must be a finite number";
    case "count":
      return typeof v === "number" && Number.isFinite(v) && v >= 0
        ? null
        : "must be a non-negative number";
    case "boolean":
      return typeof v === "boolean" ? null : "must be a boolean";
    case "date":
      return (typeof v === "string" && !Number.isNaN(new Date(v).getTime())) ||
        v instanceof Date
        ? null
        : "must be a date string";
    case "json":
      return null;
  }
}

function checkFields(
  row: Row,
  fields: Record<string, FieldSpec>,
  path: (string | number)[],
  issues: Issue[]
): void {
  for (const [key, spec] of Object.entries(fields)) {
    const required = spec.endsWith("!");
    const kind = (required ? spec.slice(0, -1) : spec) as Kind;
    const v = read(row, key);
    if (v === undefined || v === null) {
      if (required) {
        issues.push({ path: [...path, key], message: "required field is missing" });
      }
      continue;
    }
    const err = typeError(kind, v);
    if (err) issues.push({ path: [...path, key], message: err });
  }
}

function checkRows(
  value: unknown,
  spec: TableSpec,
  path: (string | number)[],
  issues: Issue[]
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "must be an array" });
    return;
  }
  const seenIds = new Set<string>();
  for (let i = 0; i < value.length; i++) {
    if (issues.length >= MAX_ISSUES) return;
    const row = value[i];
    if (!isPlainObject(row)) {
      issues.push({ path: [...path, i], message: "row must be an object" });
      continue;
    }
    // Duplicate primary keys would abort the rebuild mid-transaction.
    const id = read(row, "id");
    if (typeof id === "string") {
      if (seenIds.has(id)) {
        issues.push({ path: [...path, i, "id"], message: `duplicate id "${id}"` });
      }
      seenIds.add(id);
    }
    checkFields(row, spec.fields, [...path, i], issues);
    for (const [childKey, childFields] of Object.entries(spec.children ?? {})) {
      // The loader reads children via list(): exact key, tolerant of absence.
      const children = row[childKey];
      if (children === undefined || children === null) continue;
      checkRows(children, { fields: childFields }, [...path, i, childKey], issues);
    }
  }
}

/** id is always an optional string; duplicates are rejected per table. */
const id: FieldSpec = "string";

/**
 * One entry per table the restore reads, in restore order. Required ("!")
 * fields are EXACTLY the ones route.ts feeds to a non-nullable column via
 * reqStr — no more (skippable rows must stay skippable), no less.
 */
const TABLES: Record<string, TableSpec> = {
  locations: {
    fields: {
      id,
      name: "string!",
      type: "string",
      address: "string",
      is_default: "boolean",
      is_active: "boolean",
      created_at: "date",
    },
  },
  users: {
    // Rows without id/username are SKIPPED by the loader, so those stay
    // optional; display_name is written on both create and update paths.
    fields: {
      id,
      username: "string",
      display_name: "string!",
      email: "string",
      email_verified: "boolean",
      role: "string",
      is_active: "boolean",
      password_hash: "string",
      created_at: "date",
    },
  },
  product_categories: {
    fields: {
      id,
      name: "string!",
      description: "string",
      parent_id: "string",
      created_at: "date",
    },
  },
  products: {
    fields: {
      id,
      designation: "string!",
      description: "string",
      description_html: "string",
      unit_price: "number",
      tax_rate: "number",
      unit: "string",
      reference: "string",
      barcode: "string",
      is_service: "boolean",
      category_id: "string",
      quantity: "number",
      purchase_price: "number",
      has_variants: "boolean",
      photo_path: "string",
      created_at: "date",
    },
  },
  product_variants: {
    fields: {
      id,
      product_id: "string!",
      name: "string!",
      sku: "string",
      barcode: "string",
      attributes: "json",
      quantity: "number",
      price_override: "number",
      is_active: "boolean",
      created_at: "date",
    },
  },
  product_prices: {
    fields: {
      id,
      product_id: "string!",
      label: "string!",
      price: "number",
      created_at: "date",
    },
  },
  clients: {
    fields: {
      id,
      name: "string!",
      email: "string",
      phone: "string",
      address: "string",
      city: "string",
      postal_code: "string",
      country: "string",
      siret: "string",
      vat_number: "string",
      notes: "string",
      created_at: "date",
    },
  },
  client_contacts: {
    fields: {
      id,
      client_id: "string!",
      name: "string!",
      role: "string",
      email: "string",
      phone: "string",
      is_primary: "boolean",
      created_at: "date",
    },
  },
  suppliers: {
    fields: {
      id,
      name: "string!",
      email: "string",
      phone: "string",
      address: "string",
      notes: "string",
      created_at: "date",
    },
  },
  product_suppliers: {
    fields: {
      id,
      product_id: "string!",
      supplier_id: "string!",
      purchase_price: "number",
      created_at: "date",
    },
  },
  pos_registers: {
    fields: {
      id,
      name: "string!",
      location: "string",
      is_active: "boolean",
      location_id: "string",
      created_at: "date",
    },
  },
  pos_printer_configs: {
    fields: {
      id,
      register_id: "string",
      printer_name: "string!",
      connection_type: "string!",
      connection_address: "string!",
      paper_width: "number",
      is_default: "boolean",
      is_active: "boolean",
      created_at: "date",
    },
  },
  quotes: {
    fields: {
      id,
      quote_number: "string!",
      client_id: "string!",
      status: "string",
      issue_date: "date",
      validity_date: "date",
      subtotal: "number",
      tax_amount: "number",
      total: "number",
      notes: "string",
      notes_html: "string",
      shipping_cost: "number",
      shipping_tax_rate: "number",
      down_payment_percent: "number",
      down_payment_amount: "number",
      logo_snapshot: "string",
      created_at: "date",
    },
    children: {
      lines: {
        id,
        product_id: "string",
        description: "string!",
        description_html: "string",
        quantity: "number",
        unit_price: "number",
        tax_rate: "number",
        subtotal: "number",
        tax_amount: "number",
        total: "number",
        position: "number",
        group_name: "string",
        is_subtotal_line: "boolean",
      },
    },
  },
  invoices: {
    fields: {
      id,
      invoice_number: "string!",
      client_id: "string!",
      quote_id: "string",
      status: "string",
      issue_date: "date",
      due_date: "date",
      subtotal: "number",
      tax_amount: "number",
      total: "number",
      notes: "string",
      notes_html: "string",
      // Accepted structurally but NEVER written: the hash is recomputed
      // server-side from the restored fields (see route.ts).
      integrity_hash: "string",
      shipping_cost: "number",
      shipping_tax_rate: "number",
      down_payment_percent: "number",
      down_payment_amount: "number",
      is_down_payment_invoice: "boolean",
      parent_quote_id: "string",
      is_cash_sale: "boolean",
      stamp_duty_exempt: "boolean",
      stamp_duty: "number",
      idempotency_key: "string",
      logo_snapshot: "string",
      created_at: "date",
    },
    children: {
      lines: {
        id,
        product_id: "string",
        description: "string!",
        description_html: "string",
        quantity: "number",
        unit_price: "number",
        tax_rate: "number",
        subtotal: "number",
        tax_amount: "number",
        total: "number",
        position: "number",
        group_name: "string",
        is_subtotal_line: "boolean",
        cost_price_snapshot: "number",
      },
    },
  },
  payments: {
    fields: {
      id,
      invoice_id: "string!",
      amount: "number",
      payment_date: "date",
      payment_method: "string!",
      reference: "string",
      notes: "string",
      created_at: "date",
    },
  },
  delivery_notes: {
    fields: {
      id,
      delivery_note_number: "string!",
      client_id: "string!",
      quote_id: "string",
      invoice_id: "string",
      status: "string",
      issue_date: "date",
      delivery_date: "date",
      delivery_address: "string",
      notes: "string",
      notes_html: "string",
      created_at: "date",
    },
    children: {
      lines: {
        id,
        product_id: "string",
        description: "string!",
        description_html: "string",
        quantity: "number",
        unit: "string",
        position: "number",
        created_at: "date",
      },
    },
  },
  credit_notes: {
    fields: {
      id,
      credit_note_number: "string!",
      invoice_id: "string",
      client_id: "string!",
      status: "string",
      issue_date: "date",
      reason: "string",
      subtotal: "number",
      tax_amount: "number",
      total: "number",
      restocked: "boolean",
      notes: "string",
      created_at: "date",
    },
    children: {
      lines: {
        id,
        product_id: "string",
        variant_id: "string",
        description: "string!",
        quantity: "number",
        unit_price: "number",
        tax_rate: "number",
        subtotal: "number",
        tax_amount: "number",
        total: "number",
      },
    },
  },
  purchase_orders: {
    fields: {
      id,
      order_number: "string!",
      supplier_id: "string!",
      status: "string",
      order_date: "date",
      confirmed_date: "date",
      paid_from_register: "boolean",
      register_id: "string",
      session_id: "string",
      payment_status: "string",
      subtotal: "number",
      tax_amount: "number",
      total: "number",
      notes: "string",
      location_id: "string",
      created_at: "date",
    },
    children: {
      lines: {
        id,
        product_id: "string!",
        variant_id: "string",
        quantity: "number",
        received_quantity: "number",
        unit_price: "number",
        previous_price: "number",
        use_average_price: "boolean",
        subtotal: "number",
        tax_rate: "number",
        tax_amount: "number",
        total: "number",
      },
    },
  },
  supplier_payments: {
    fields: {
      id,
      supplier_id: "string!",
      purchase_order_id: "string",
      amount: "number",
      payment_date: "date",
      payment_method: "string",
      reference: "string",
      notes: "string",
      created_at: "date",
    },
  },
  // POS history: register_id / user_id / session_id stay OPTIONAL — the loader
  // deliberately SKIPS rows whose parents are missing rather than failing.
  pos_sessions: {
    fields: {
      id,
      register_id: "string",
      user_id: "string",
      opened_at: "date",
      closed_at: "date",
      opening_float: "number",
      expected_cash: "number",
      actual_cash: "number",
      cash_difference: "number",
      status: "string",
      notes: "string",
      created_at: "date",
    },
  },
  pos_transactions: {
    fields: {
      id,
      ticket_number: "string!",
      register_id: "string",
      session_id: "string",
      client_id: "string",
      user_id: "string",
      invoice_id: "string",
      transaction_date: "date",
      subtotal: "number",
      tax_amount: "number",
      total: "number",
      discount_percent: "number",
      discount_amount: "number",
      final_amount: "number",
      status: "string",
      notes: "string",
      created_at: "date",
    },
    children: {
      lines: {
        id,
        product_id: "string",
        variant_id: "string",
        barcode: "string",
        designation: "string!",
        quantity: "number",
        unit_price: "number",
        tax_rate: "number",
        subtotal: "number",
        tax_amount: "number",
        total: "number",
        discount_percent: "number",
        position: "number",
        cost_price_snapshot: "number",
        created_at: "date",
      },
      payments: {
        id,
        payment_method: "string!",
        amount: "number",
        cash_given: "number",
        change_given: "number",
        card_reference: "string",
        created_at: "date",
      },
    },
  },
  pos_cash_movements: {
    fields: {
      id,
      session_id: "string",
      user_id: "string",
      movement_type: "string!",
      amount: "number",
      reason: "string!",
      reference: "string",
      created_at: "date",
    },
  },
  stock_levels: {
    fields: {
      id,
      location_id: "string!",
      product_id: "string!",
      variant_id: "string",
      quantity: "number",
    },
  },
  stock_movements: {
    fields: {
      id,
      product_id: "string!",
      variant_id: "string",
      type: "string!",
      quantity_change: "number",
      balance_after: "number",
      reason: "string",
      reference_type: "string",
      reference_id: "string",
      user_id: "string",
      location_id: "string",
      created_at: "date",
    },
  },
  stock_transfers: {
    fields: {
      id,
      transfer_number: "string!",
      from_location_id: "string!",
      to_location_id: "string!",
      status: "string",
      notes: "string",
      created_by: "string",
      created_at: "date",
    },
    children: {
      lines: {
        id,
        product_id: "string!",
        variant_id: "string",
        quantity: "number",
      },
    },
  },
  expenses: {
    fields: {
      id,
      name: "string!",
      amount: "number",
      date: "date",
      notes: "string",
      created_at: "date",
    },
  },
  reminders: {
    fields: {
      id,
      reminder_type: "string!",
      document_type: "string!",
      document_id: "string!",
      scheduled_date: "date",
      sent_at: "date",
      message: "string",
      created_at: "date",
    },
  },
  user_permissions: {
    // user_id optional: rows pointing at unknown users are skipped, not fatal.
    fields: {
      id,
      user_id: "string",
      permission_key: "string!",
      granted: "boolean",
      can_view: "boolean",
      can_create: "boolean",
      can_edit: "boolean",
      can_delete: "boolean",
    },
  },
};

/** Company settings: every field the loader reads, all optional (fallbacks). */
const SETTINGS_FIELDS: Record<string, FieldSpec> = {
  company_name: "string",
  address: "string",
  city: "string",
  postal_code: "string",
  country: "string",
  phone: "string",
  email: "string",
  website: "string",
  siret: "string",
  vat_number: "string",
  logo_path: "string",
  default_tax_rate: "number",
  default_payment_terms: "number",
  invoice_prefix: "string",
  quote_prefix: "string",
  next_invoice_number: "count",
  next_quote_number: "count",
  legal_mentions: "string",
  legal_mentions_html: "string",
  bank_details: "string",
  delivery_note_prefix: "string",
  next_delivery_note_number: "count",
  app_language: "string",
  app_theme: "string",
  currency: "string",
  pos_ticket_prefix: "string",
  pos_auto_print_receipt: "boolean",
  pos_show_stock_warning: "boolean",
  pos_low_stock_threshold: "number",
  credit_note_prefix: "string",
  next_credit_note_number: "count",
  dashboard_layout: "json",
  stamp_duty_enabled: "boolean",
  stamp_duty_rate: "number",
  stamp_duty_threshold: "number",
};

function collectBackupIssues(data: unknown): Issue[] {
  const issues: Issue[] = [];

  if (!isPlainObject(data)) {
    return [{ path: [], message: "backup file must be a JSON object" }];
  }

  for (const [table, spec] of Object.entries(TABLES)) {
    if (issues.length >= MAX_ISSUES) break;
    const value = data[table];
    // Absent tables are legal (v2 files, lean exports) — the loader treats
    // them as empty. Only a PRESENT key with the wrong shape is corruption.
    if (value === undefined || value === null) continue;
    checkRows(value, spec, [table], issues);
  }

  const settings = data.settings;
  if (settings !== undefined && settings !== null) {
    if (!isPlainObject(settings)) {
      issues.push({ path: ["settings"], message: "must be an object" });
    } else {
      checkFields(settings, SETTINGS_FIELDS, ["settings"], issues);
    }
  }

  // v3.1 content-addressed media map: { "<sha256hex>": "<base64>" }. A
  // reference whose entry is MISSING degrades to null in the loader, but an
  // entry that exists with a non-string value is corruption.
  const assets = data.assets;
  if (assets !== undefined && assets !== null) {
    if (!isPlainObject(assets)) {
      issues.push({ path: ["assets"], message: "must be an object" });
    } else {
      for (const [hash, content] of Object.entries(assets)) {
        if (issues.length >= MAX_ISSUES) break;
        if (typeof content !== "string") {
          issues.push({ path: ["assets", hash], message: "must be a string" });
        }
      }
    }
  }

  return issues;
}

/**
 * The whole-file schema handed to validateBody(). Unlike a z.object() schema
 * this STRIPS NOTHING: the parsed value is the original payload, so keys the
 * loader reads directly (includes_photos, assets, ...) survive untouched.
 */
export const backupFileSchema = z.unknown().superRefine((data, ctx) => {
  for (const issue of collectBackupIssues(data).slice(0, MAX_ISSUES)) {
    ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
  }
});
