import { API_BASE_URL } from "./config";
import { queueMutationRaw } from "./offline-mutations";
import { toast } from "@/stores/useToastStore";
import i18n from "@/i18n";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface EndpointDef {
  method: HttpMethod;
  path: string | ((args: Record<string, unknown>) => string);
  /** Extract body from args (default: send full args as body for POST/PUT) */
  body?: (args: Record<string, unknown>) => unknown;
  /** Extract query params from args for GET requests */
  query?: (args: Record<string, unknown>) => Record<string, string>;
}

// Maps command names to REST API endpoints
const COMMAND_MAP: Record<string, EndpointDef> = {
  // Clients
  get_clients: { method: "GET", path: "/api/clients" },
  get_client: { method: "GET", path: (a) => `/api/clients/${a.id}` },
  create_client: { method: "POST", path: "/api/clients", body: (a) => a.input },
  update_client: {
    method: "PUT",
    path: (a) => `/api/clients/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_client: { method: "DELETE", path: (a) => `/api/clients/${a.id}` },
  batch_delete_clients: {
    method: "POST",
    path: "/api/clients/batch-delete",
    body: (a) => a.ids,
  },

  // Products
  get_products: { method: "GET", path: "/api/products" },
  get_product: { method: "GET", path: (a) => `/api/products/${a.id}` },
  create_product: { method: "POST", path: "/api/products", body: (a) => a.input },
  update_product: {
    method: "PUT",
    path: (a) => `/api/products/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_product: { method: "DELETE", path: (a) => `/api/products/${a.id}` },
  batch_delete_products: {
    method: "POST",
    path: "/api/products/batch-delete",
    body: (a) => a.ids,
  },

  // Product Categories
  get_product_categories: { method: "GET", path: "/api/categories" },
  get_product_category: {
    method: "GET",
    path: (a) => `/api/categories/${a.id}`,
  },
  create_product_category: {
    method: "POST",
    path: "/api/categories",
    body: (a) => a.input,
  },
  update_product_category: {
    method: "PUT",
    path: (a) => `/api/categories/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_product_category: {
    method: "DELETE",
    path: (a) => `/api/categories/${a.id}`,
  },

  // Quotes
  get_quotes: { method: "GET", path: "/api/quotes" },
  get_quote: { method: "GET", path: (a) => `/api/quotes/${a.id}` },
  create_quote: { method: "POST", path: "/api/quotes", body: (a) => a.input },
  update_quote: {
    method: "PUT",
    path: (a) => `/api/quotes/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_quote: { method: "DELETE", path: (a) => `/api/quotes/${a.id}` },
  batch_delete_quotes: {
    method: "POST",
    path: "/api/quotes/batch-delete",
    body: (a) => a.ids,
  },
  convert_quote_to_invoice: {
    method: "POST",
    path: (a) => `/api/quotes/${a.id}/convert-to-invoice`,
  },
  convert_quote_to_delivery_note: {
    method: "POST",
    path: (a) => `/api/quotes/${a.id}/convert-to-delivery-note`,
  },
  duplicate_quote: {
    method: "POST",
    path: (a) => `/api/quotes/${a.id}/duplicate`,
  },

  // Invoices
  get_invoices: { method: "GET", path: "/api/invoices" },
  get_invoice: { method: "GET", path: (a) => `/api/invoices/${a.id}` },
  create_invoice: {
    method: "POST",
    path: "/api/invoices",
    body: (a) => a.input,
  },
  update_invoice: {
    method: "PUT",
    path: (a) => `/api/invoices/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_invoice: { method: "DELETE", path: (a) => `/api/invoices/${a.id}` },
  batch_delete_invoices: {
    method: "POST",
    path: "/api/invoices/batch-delete",
    body: (a) => a.ids,
  },
  mark_invoice_paid: {
    method: "POST",
    path: (a) => `/api/invoices/${a.id}/mark-paid`,
  },
  issue_invoice: {
    method: "POST",
    path: (a) => `/api/invoices/${a.id}/issue`,
  },
  verify_invoice_integrity: {
    method: "GET",
    path: (a) => `/api/invoices/${a.id}/verify-integrity`,
  },
  duplicate_invoice: {
    method: "POST",
    path: (a) => `/api/invoices/${a.id}/duplicate`,
  },
  convert_invoice_to_delivery_note: {
    method: "POST",
    path: (a) => `/api/invoices/${a.id}/convert-to-delivery-note`,
  },
  create_invoice_from_delivery_notes: {
    method: "POST",
    path: "/api/invoices/from-delivery-notes",
    body: (a) => a.deliveryNoteIds,
  },

  // Payments
  get_payments_by_invoice: {
    method: "GET",
    path: (a) => `/api/payments/by-invoice/${a.invoiceId}`,
  },
  create_payment: {
    method: "POST",
    path: "/api/payments",
    body: (a) => a.input,
  },
  delete_payment: { method: "DELETE", path: (a) => `/api/payments/${a.id}` },

  // Settings
  get_company_settings: { method: "GET", path: "/api/settings" },
  update_company_settings: {
    method: "PUT",
    path: "/api/settings",
    body: (a) => a.input,
  },
  update_app_settings: {
    method: "PUT",
    path: "/api/settings/app",
    body: (a) => ({
      app_language: a.appLanguage,
      app_theme: a.appTheme,
    }),
  },
  get_dashboard_stats: { method: "GET", path: "/api/settings/dashboard" },
  export_data: { method: "GET", path: "/api/export" },

  // Expenses
  get_expenses: { method: "GET", path: "/api/expenses" },
  get_expense: { method: "GET", path: (a) => `/api/expenses/${a.id}` },
  create_expense: {
    method: "POST",
    path: "/api/expenses",
    body: (a) => a.input,
  },
  update_expense: {
    method: "PUT",
    path: (a) => `/api/expenses/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_expense: { method: "DELETE", path: (a) => `/api/expenses/${a.id}` },
  batch_delete_expenses: {
    method: "POST",
    path: "/api/expenses/batch-delete",
    body: (a) => a.ids,
  },

  // Suppliers
  get_suppliers: { method: "GET", path: "/api/suppliers" },
  get_supplier: { method: "GET", path: (a) => `/api/suppliers/${a.id}` },
  create_supplier: {
    method: "POST",
    path: "/api/suppliers",
    body: (a) => a.input,
  },
  update_supplier: {
    method: "PUT",
    path: (a) => `/api/suppliers/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_supplier: {
    method: "DELETE",
    path: (a) => `/api/suppliers/${a.id}`,
  },
  batch_delete_suppliers: {
    method: "POST",
    path: "/api/suppliers/batch-delete",
    body: (a) => a.ids,
  },

  // Product-Supplier links
  get_all_product_supplier_summaries: {
    method: "GET",
    path: "/api/product-suppliers/summaries",
  },
  get_suppliers_for_product: {
    method: "GET",
    path: (a) => `/api/product-suppliers/by-product/${a.productId}`,
  },
  get_products_for_supplier: {
    method: "GET",
    path: (a) => `/api/product-suppliers/by-supplier/${a.supplierId}`,
  },
  add_product_supplier: {
    method: "POST",
    path: "/api/product-suppliers",
    body: (a) => a.input,
  },
  remove_product_supplier: {
    method: "DELETE",
    path: (a) => `/api/product-suppliers/${a.linkId}`,
  },
  update_product_supplier_price: {
    method: "PUT",
    path: (a) => `/api/product-suppliers/${a.linkId}/price`,
    body: (a) => ({ purchase_price: a.purchasePrice }),
  },

  // Delivery Notes
  get_delivery_notes: { method: "GET", path: "/api/delivery-notes" },
  get_delivery_note: {
    method: "GET",
    path: (a) => `/api/delivery-notes/${a.id}`,
  },
  create_delivery_note: {
    method: "POST",
    path: "/api/delivery-notes",
    body: (a) => a.input,
  },
  update_delivery_note: {
    method: "PUT",
    path: (a) =>
      `/api/delivery-notes/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_delivery_note: {
    method: "DELETE",
    path: (a) => `/api/delivery-notes/${a.id}`,
  },
  batch_delete_delivery_notes: {
    method: "POST",
    path: "/api/delivery-notes/batch-delete",
    body: (a) => a.ids,
  },
  duplicate_delivery_note: {
    method: "POST",
    path: (a) => `/api/delivery-notes/${a.id}/duplicate`,
  },
  convert_delivery_note_to_invoice: {
    method: "POST",
    path: (a) => `/api/delivery-notes/${a.id}/convert-to-invoice`,
  },

  // Client Contacts
  get_client_contacts: { method: "GET", path: "/api/contacts" },
  get_client_contacts_by_client: {
    method: "GET",
    path: (a) => `/api/contacts/by-client/${a.clientId}`,
  },
  get_client_contact: { method: "GET", path: (a) => `/api/contacts/${a.id}` },
  create_client_contact: {
    method: "POST",
    path: "/api/contacts",
    body: (a) => a.input,
  },
  update_client_contact: {
    method: "PUT",
    path: (a) => `/api/contacts/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_client_contact: {
    method: "DELETE",
    path: (a) => `/api/contacts/${a.id}`,
  },
  search_contacts: {
    method: "GET",
    path: "/api/contacts/search",
    query: (a) => ({ query: String(a.query || "") }),
  },

  // Reminders
  get_reminders: { method: "GET", path: "/api/reminders" },
  get_pending_reminders: { method: "GET", path: "/api/reminders/pending" },
  get_reminders_by_document: {
    method: "GET",
    path: (a) =>
      `/api/reminders/by-document/${a.documentType}/${a.documentId}`,
  },
  create_reminder: {
    method: "POST",
    path: "/api/reminders",
    body: (a) => a.input,
  },
  mark_reminder_sent: {
    method: "POST",
    path: (a) => `/api/reminders/${a.id}/mark-sent`,
  },
  send_reminder_email: {
    method: "POST",
    path: (a) => `/api/reminders/${a.id}/send`,
  },
  delete_reminder: { method: "DELETE", path: (a) => `/api/reminders/${a.id}` },
  check_and_create_reminders: {
    method: "POST",
    path: "/api/reminders/check-and-create",
  },

  // Reports
  get_revenue_by_month: {
    method: "GET",
    path: "/api/reports/revenue-by-month",
    query: (a) => {
      const q: Record<string, string> = {};
      if (a.startDate) q.startDate = String(a.startDate);
      if (a.endDate) q.endDate = String(a.endDate);
      return q;
    },
  },
  get_revenue_by_client: {
    method: "GET",
    path: "/api/reports/revenue-by-client",
    query: (a) => {
      const q: Record<string, string> = {};
      if (a.startDate) q.startDate = String(a.startDate);
      if (a.endDate) q.endDate = String(a.endDate);
      return q;
    },
  },
  get_product_sales: {
    method: "GET",
    path: "/api/reports/product-sales",
    query: (a) => {
      const q: Record<string, string> = {};
      if (a.startDate) q.startDate = String(a.startDate);
      if (a.endDate) q.endDate = String(a.endDate);
      return q;
    },
  },
  get_outstanding_payments: {
    method: "GET",
    path: "/api/reports/outstanding-payments",
  },
  get_quote_conversion_stats: {
    method: "GET",
    path: "/api/reports/quote-conversion",
    query: (a) => {
      const q: Record<string, string> = {};
      if (a.startDate) q.startDate = String(a.startDate);
      if (a.endDate) q.endDate = String(a.endDate);
      return q;
    },
  },

  // Alerts
  get_alerts_summary: { method: "GET", path: "/api/alerts/summary" },
  mark_quote_expired: {
    method: "POST",
    path: (a) => `/api/alerts/mark-quote-expired/${a.quoteId}`,
  },

  // Auth
  login: { method: "POST", path: "/api/auth/login", body: (a) => a.input },
  logout: { method: "POST", path: "/api/auth/logout" },
  get_current_user: { method: "GET", path: "/api/auth/me" },
  // TOTP
  totp_setup: { method: "POST", path: "/api/auth/totp/setup" },
  totp_verify_setup: { method: "POST", path: "/api/auth/totp/verify-setup", body: (a) => a.input },
  totp_disable: { method: "POST", path: "/api/auth/totp/disable", body: (a) => a.input },
  totp_verify: { method: "POST", path: "/api/auth/totp/verify", body: (a) => a.input },
  // Sessions
  get_sessions: { method: "GET", path: "/api/auth/sessions" },
  revoke_session: { method: "DELETE", path: (a) => `/api/auth/sessions/${a.id}` },
  revoke_all_sessions: { method: "POST", path: "/api/auth/sessions/revoke-all" },

  get_users: { method: "GET", path: "/api/auth/users" },
  create_user_account: {
    method: "POST",
    path: "/api/auth/users",
    body: (a) => a.input,
  },
  update_user_account: {
    method: "PUT",
    path: (a) => `/api/auth/users/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_user_account: {
    method: "DELETE",
    path: (a) => `/api/auth/users/${a.id}`,
  },
  change_own_password: {
    method: "POST",
    path: "/api/auth/change-password",
    body: (a) => ({
      current_password: a.currentPassword,
      new_password: a.newPassword,
    }),
  },
  verify_email: { method: "POST", path: "/api/auth/verify-email", body: (a) => a.input },
  resend_verification: { method: "POST", path: "/api/auth/resend-verification" },
  forgot_password: { method: "POST", path: "/api/auth/forgot-password", body: (a) => a.input },
  reset_password: { method: "POST", path: "/api/auth/reset-password", body: (a) => a.input },

  // Product photos
  get_product_photo_base64: {
    method: "GET",
    path: (a) => `/api/products/${a.productId}/photo`,
  },
  delete_product_photo: {
    method: "DELETE",
    path: (a) => `/api/products/${a.productId}/photo`,
  },

  // Logo
  get_logo_base64: { method: "GET", path: "/api/settings/logo" },
  delete_logo: { method: "DELETE", path: "/api/settings/logo" },

  // POS
  get_pos_registers: { method: "GET", path: "/api/pos/registers" },
  get_pos_register: { method: "GET", path: (a) => `/api/pos/registers/${a.id}` },
  create_pos_register: { method: "POST", path: "/api/pos/registers", body: (a) => a.input },
  update_pos_register: {
    method: "PUT",
    path: (a) => `/api/pos/registers/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_pos_register: { method: "DELETE", path: (a) => `/api/pos/registers/${a.id}` },
  get_active_pos_session: {
    method: "GET",
    path: (a) => `/api/pos/sessions/active/${a.registerId}`,
  },
  open_pos_session: { method: "POST", path: "/api/pos/sessions/open", body: (a) => a.input },
  close_pos_session: { method: "POST", path: "/api/pos/sessions/close", body: (a) => a.input },
  get_pos_session_summary: {
    method: "GET",
    path: (a) => `/api/pos/sessions/${a.sessionId}/summary`,
  },
  lookup_product_by_barcode: {
    method: "GET",
    path: (a) => `/api/pos/products/barcode/${a.barcode}`,
  },
  create_pos_transaction: {
    method: "POST",
    path: "/api/pos/transactions",
    body: (a) => a.input,
  },
  get_pos_transaction: {
    method: "GET",
    path: (a) => `/api/pos/transactions/${a.id}`,
  },
  cancel_pos_transaction: {
    method: "POST",
    path: (a) => `/api/pos/transactions/${a.id}/cancel`,
    body: (a) => ({ reason: a.reason }),
  },
  get_pos_session_transactions: {
    method: "GET",
    path: (a) => `/api/pos/sessions/${a.sessionId}/transactions`,
  },
  create_pos_cash_movement: {
    method: "POST",
    path: "/api/pos/cash-movements",
    body: (a) => a.input,
  },
  get_pos_session_cash_movements: {
    method: "GET",
    path: (a) => `/api/pos/sessions/${a.sessionId}/cash-movements`,
  },
  get_pos_printer_configs: { method: "GET", path: "/api/pos/printers" },
  create_pos_printer_config: {
    method: "POST",
    path: "/api/pos/printers",
    body: (a) => a.input,
  },
  update_pos_printer_config: {
    method: "PUT",
    path: (a) => `/api/pos/printers/${(a.input as Record<string, unknown>).id}`,
    body: (a) => a.input,
  },
  delete_pos_printer_config: {
    method: "DELETE",
    path: (a) => `/api/pos/printers/${a.id}`,
  },
  get_daily_pos_report: {
    method: "GET",
    path: "/api/pos/reports/daily",
    query: (a) => {
      const q: Record<string, string> = { date: String(a.date) };
      if (a.registerId) q.registerId = String(a.registerId);
      return q;
    },
  },
  // Import (file upload via FormData)
  import_clients: { method: "POST", path: "/api/import/clients" },
  import_products: { method: "POST", path: "/api/import/products" },
  import_suppliers: { method: "POST", path: "/api/import/suppliers" },
  import_backup: { method: "POST", path: "/api/import/backup", body: (a) => a.data },
};

/**
 * Unified API call.
 * Maps command names to REST endpoints and uses fetch.
 */
export async function apiCall<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  const endpoint = COMMAND_MAP[command];
  if (!endpoint) {
    throw new Error(`Unknown command: ${command}. No REST mapping found.`);
  }

  const path =
    typeof endpoint.path === "function"
      ? endpoint.path(args || {})
      : endpoint.path;

  let url = `${API_BASE_URL}${path}`;

  // Append query parameters for GET requests
  if (endpoint.query && args) {
    const params = endpoint.query(args);
    const searchParams = new URLSearchParams(params);
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const fetchOpts: RequestInit = {
    method: endpoint.method,
    headers: { "Content-Type": "application/json" },
    credentials: "include", // send httpOnly JWT cookie
  };

  if (
    (endpoint.method === "POST" || endpoint.method === "PUT" || endpoint.method === "DELETE") &&
    args
  ) {
    const bodyData = endpoint.body ? endpoint.body(args) : args;
    if (bodyData !== undefined) {
      fetchOpts.body = JSON.stringify(bodyData);
    }
  }

  const isWrite = endpoint.method !== "GET";

  try {
    const res = await fetch(url, fetchOpts);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed with status ${res.status}`);
    }

    // Handle empty responses (204 No Content, or empty body)
    const contentType = res.headers.get("content-type");
    if (
      res.status === 204 ||
      !contentType ||
      !contentType.includes("application/json")
    ) {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  } catch (err) {
    // If offline and this is a write operation, queue for later sync
    const isNetworkError =
      !navigator.onLine ||
      (err instanceof TypeError && err.message.includes("fetch"));

    if (isWrite && isNetworkError) {
      await queueMutationRaw({
        url,
        method: endpoint.method,
        headers: { "Content-Type": "application/json" },
        body: fetchOpts.body as string | null ?? null,
        label: command.replace(/_/g, " "),
      });
      // Notify user that the operation was saved for later
      toast.info(i18n.t("common:offline.queued"));
      // Return a placeholder so the caller doesn't crash
      return { _offline: true, _queued: command } as T;
    }

    throw err;
  }
}
