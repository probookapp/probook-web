import { apiCall } from "./api-adapter";
import { API_BASE_URL } from "./config";
import type {
  Client,
  CreateClientInput,
  UpdateClientInput,
  Product,
  CreateProductInput,
  UpdateProductInput,
  ProductVariant,
  CreateProductVariantInput,
  UpdateProductVariantInput,
  PurchaseOrder,
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ConfirmPurchaseOrderInput,
  SupplierPayment,
  CreateSupplierPaymentInput,
  SupplierCreditSummary,
  ProductCategory,
  CreateProductCategoryInput,
  UpdateProductCategoryInput,
  Quote,
  CreateQuoteInput,
  UpdateQuoteInput,
  Invoice,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  Payment,
  CreatePaymentInput,
  CompanySettings,
  UpdateCompanySettingsInput,
  DashboardStats,
  Expense,
  CreateExpenseInput,
  UpdateExpenseInput,
  DeliveryNote,
  CreateDeliveryNoteInput,
  UpdateDeliveryNoteInput,
  ClientContact,
  CreateClientContactInput,
  UpdateClientContactInput,
  Reminder,
  CreateReminderInput,
  RevenueByPeriod,
  RevenueByClient,
  ProductSales,
  OutstandingPayment,
  QuoteConversionStats,
  AlertsSummary,
  Supplier,
  CreateSupplierInput,
  UpdateSupplierInput,
  SupplierWithPrice,
  ProductWithPrice,
  ProductSupplier,
  CreateProductSupplierInput,
  ProductSupplierSummary,
  ImportResult,
  UserInfo,
  LoginInput,
  CreateUserInput,
  UpdateUserInput,
  // POS types
  PosRegister,
  CreatePosRegisterInput,
  UpdatePosRegisterInput,
  PosSession,
  OpenSessionInput,
  CloseSessionInput,
  PosTransaction,
  CreatePosTransactionInput,
  PosCashMovement,
  CreateCashMovementInput,
  PosPrinterConfig,
  CreatePrinterConfigInput,
  UpdatePrinterConfigInput,
  SessionSummary,
  DailyPosReport,
} from "@/types";

// Client commands
export const clientApi = {
  getAll: () => apiCall<Client[]>("get_clients"),
  getById: (id: string) => apiCall<Client>("get_client", { id }),
  create: (input: CreateClientInput) => apiCall<Client>("create_client", { input }),
  update: (input: UpdateClientInput) => apiCall<Client>("update_client", { input }),
  delete: (id: string) => apiCall<void>("delete_client", { id }),
  batchDelete: (ids: string[]) => apiCall<number>("batch_delete_clients", { ids }),
};

// Product commands
export const productApi = {
  getAll: () => apiCall<Product[]>("get_products"),
  getAllWithDetails: () => apiCall<Product[]>("get_products", { include: "prices,variants" }),
  getById: (id: string) => apiCall<Product>("get_product", { id }),
  create: (input: CreateProductInput) => apiCall<Product>("create_product", { input }),
  update: (input: UpdateProductInput) => apiCall<Product>("update_product", { input }),
  delete: (id: string) => apiCall<void>("delete_product", { id }),
  batchDelete: (ids: string[]) => apiCall<number>("batch_delete_products", { ids }),
  uploadPhoto: async (productId: string, file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE_URL}/api/products/${productId}/photo`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Failed to upload photo");
    }
    return res.json();
  },
  getPhotoBase64: (productId: string) =>
    apiCall<string | null>("get_product_photo_base64", { productId }),
  deletePhoto: (productId: string) =>
    apiCall<void>("delete_product_photo", { productId }),
};

// Product Variant commands
export const productVariantApi = {
  getAll: (productId: string) =>
    apiCall<ProductVariant[]>("get_product_variants", { productId }),
  getById: (productId: string, variantId: string) =>
    apiCall<ProductVariant>("get_product_variant", { productId, variantId }),
  create: (productId: string, input: CreateProductVariantInput) =>
    apiCall<ProductVariant>("create_product_variant", { productId, input }),
  update: (productId: string, variantId: string, input: UpdateProductVariantInput) =>
    apiCall<ProductVariant>("update_product_variant", { productId, variantId, input }),
  delete: (productId: string, variantId: string) =>
    apiCall<void>("delete_product_variant", { productId, variantId }),
};

// Product Category commands
export const productCategoryApi = {
  getAll: () => apiCall<ProductCategory[]>("get_product_categories"),
  getById: (id: string) => apiCall<ProductCategory>("get_product_category", { id }),
  create: (input: CreateProductCategoryInput) =>
    apiCall<ProductCategory>("create_product_category", { input }),
  update: (input: UpdateProductCategoryInput) =>
    apiCall<ProductCategory>("update_product_category", { input }),
  delete: (id: string) => apiCall<void>("delete_product_category", { id }),
};

// Quote commands
export const quoteApi = {
  getAll: () => apiCall<Quote[]>("get_quotes"),
  getById: (id: string) => apiCall<Quote>("get_quote", { id }),
  create: (input: CreateQuoteInput) => apiCall<Quote>("create_quote", { input }),
  update: (input: UpdateQuoteInput) => apiCall<Quote>("update_quote", { input }),
  delete: (id: string) => apiCall<void>("delete_quote", { id }),
  batchDelete: (ids: string[]) => apiCall<number>("batch_delete_quotes", { ids }),
  convertToInvoice: (id: string) => apiCall<Invoice>("convert_quote_to_invoice", { id }),
  convertToDeliveryNote: (id: string) => apiCall<DeliveryNote>("convert_quote_to_delivery_note", { id }),
  duplicate: (id: string) => apiCall<Quote>("duplicate_quote", { id }),
};

// Invoice commands
export const invoiceApi = {
  getAll: () => apiCall<Invoice[]>("get_invoices"),
  getById: (id: string) => apiCall<Invoice>("get_invoice", { id }),
  create: (input: CreateInvoiceInput) => apiCall<Invoice>("create_invoice", { input }),
  update: (input: UpdateInvoiceInput) => apiCall<Invoice>("update_invoice", { input }),
  delete: (id: string) => apiCall<void>("delete_invoice", { id }),
  batchDelete: (ids: string[]) => apiCall<number>("batch_delete_invoices", { ids }),
  markAsPaid: (id: string) => apiCall<Invoice>("mark_invoice_paid", { id }),
  issue: (id: string) => apiCall<Invoice>("issue_invoice", { id }),
  verifyIntegrity: (id: string) => apiCall<boolean>("verify_invoice_integrity", { id }),
  duplicate: (id: string) => apiCall<Invoice>("duplicate_invoice", { id }),
  convertToDeliveryNote: (id: string) => apiCall<DeliveryNote>("convert_invoice_to_delivery_note", { id }),
  createFromDeliveryNotes: (deliveryNoteIds: string[]) =>
    apiCall<Invoice>("create_invoice_from_delivery_notes", { deliveryNoteIds }),
};

// Payment commands
export const paymentApi = {
  getByInvoice: (invoiceId: string) => apiCall<Payment[]>("get_payments_by_invoice", { invoiceId }),
  create: (input: CreatePaymentInput) => apiCall<Payment>("create_payment", { input }),
  delete: (id: string) => apiCall<void>("delete_payment", { id }),
};

// Company Settings commands
export const settingsApi = {
  get: () => apiCall<CompanySettings>("get_company_settings"),
  update: (input: UpdateCompanySettingsInput) =>
    apiCall<CompanySettings>("update_company_settings", { input }),
  updateAppSettings: (appLanguage: string, appTheme: string) =>
    apiCall<CompanySettings>("update_app_settings", { appLanguage, appTheme }),
  uploadLogo: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE_URL}/api/settings/logo`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Failed to upload logo");
    }
    return res.json();
  },
  getLogoBase64: () => apiCall<string | null>("get_logo_base64"),
  deleteLogo: () => apiCall<void>("delete_logo"),
};

// Expense commands
export const expenseApi = {
  getAll: () => apiCall<Expense[]>("get_expenses"),
  getById: (id: string) => apiCall<Expense>("get_expense", { id }),
  create: (input: CreateExpenseInput) => apiCall<Expense>("create_expense", { input }),
  update: (input: UpdateExpenseInput) => apiCall<Expense>("update_expense", { input }),
  delete: (id: string) => apiCall<void>("delete_expense", { id }),
  batchDelete: (ids: string[]) => apiCall<number>("batch_delete_expenses", { ids }),
};

// Supplier commands
export const supplierApi = {
  getAll: () => apiCall<Supplier[]>("get_suppliers"),
  getById: (id: string) => apiCall<Supplier>("get_supplier", { id }),
  create: (input: CreateSupplierInput) => apiCall<Supplier>("create_supplier", { input }),
  update: (input: UpdateSupplierInput) => apiCall<Supplier>("update_supplier", { input }),
  delete: (id: string) => apiCall<void>("delete_supplier", { id }),
  batchDelete: (ids: string[]) => apiCall<number>("batch_delete_suppliers", { ids }),
};

// Product-Supplier commands
export const productSupplierApi = {
  getAllSummaries: () => apiCall<ProductSupplierSummary[]>("get_all_product_supplier_summaries"),
  getSuppliersForProduct: (productId: string) => apiCall<SupplierWithPrice[]>("get_suppliers_for_product", { productId }),
  getProductsForSupplier: (supplierId: string) => apiCall<ProductWithPrice[]>("get_products_for_supplier", { supplierId }),
  addLink: (input: CreateProductSupplierInput) => apiCall<ProductSupplier>("add_product_supplier", { input }),
  removeLink: (linkId: string) => apiCall<void>("remove_product_supplier", { linkId }),
  updatePrice: (linkId: string, purchasePrice: number) => apiCall<void>("update_product_supplier_price", { linkId, purchasePrice }),
};

// Purchase Order commands
export const purchaseApi = {
  getAll: () => apiCall<PurchaseOrder[]>("get_purchases"),
  getById: (id: string) => apiCall<PurchaseOrder>("get_purchase", { id }),
  create: (input: CreatePurchaseOrderInput) => apiCall<PurchaseOrder>("create_purchase", { input }),
  update: (input: UpdatePurchaseOrderInput) => apiCall<PurchaseOrder>("update_purchase", { input }),
  delete: (id: string) => apiCall<void>("delete_purchase", { id }),
  batchDelete: (ids: string[]) => apiCall<number>("batch_delete_purchases", { ids }),
  confirm: (id: string, input: ConfirmPurchaseOrderInput) => apiCall<PurchaseOrder>("confirm_purchase", { id, input }),
  cancel: (id: string) => apiCall<PurchaseOrder>("cancel_purchase", { id }),
};

// Supplier Credit commands
export const supplierCreditApi = {
  getCredits: (supplierId: string) => apiCall<SupplierCreditSummary>("get_supplier_credits", { supplierId }),
  getPayments: (supplierId: string) => apiCall<SupplierPayment[]>("get_supplier_payments", { supplierId }),
  createPayment: (supplierId: string, input: CreateSupplierPaymentInput) =>
    apiCall<SupplierPayment>("create_supplier_payment", { supplierId, input }),
};

// Dashboard commands
export const dashboardApi = {
  getStats: () => apiCall<DashboardStats>("get_dashboard_stats"),
};

// Data export (admin only - triggers JSON download)
export const exportApi = {
  download: async (): Promise<void> => {
    const res = await fetch(`${API_BASE_URL}/api/export`, { credentials: "include" });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `probook-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// Delivery Note commands
export const deliveryNoteApi = {
  getAll: () => apiCall<DeliveryNote[]>("get_delivery_notes"),
  getById: (id: string) => apiCall<DeliveryNote>("get_delivery_note", { id }),
  create: (input: CreateDeliveryNoteInput) =>
    apiCall<DeliveryNote>("create_delivery_note", { input }),
  update: (input: UpdateDeliveryNoteInput) =>
    apiCall<DeliveryNote>("update_delivery_note", { input }),
  delete: (id: string) => apiCall<void>("delete_delivery_note", { id }),
  batchDelete: (ids: string[]) => apiCall<number>("batch_delete_delivery_notes", { ids }),
  duplicate: (id: string) => apiCall<DeliveryNote>("duplicate_delivery_note", { id }),
  convertToInvoice: (id: string) => apiCall<Invoice>("convert_delivery_note_to_invoice", { id }),
};

// Client Contact commands
export const clientContactApi = {
  getAll: () => apiCall<ClientContact[]>("get_client_contacts"),
  getByClientId: (clientId: string) =>
    apiCall<ClientContact[]>("get_client_contacts_by_client", { clientId }),
  getById: (id: string) => apiCall<ClientContact>("get_client_contact", { id }),
  create: (input: CreateClientContactInput) =>
    apiCall<ClientContact>("create_client_contact", { input }),
  update: (input: UpdateClientContactInput) =>
    apiCall<ClientContact>("update_client_contact", { input }),
  delete: (id: string) => apiCall<void>("delete_client_contact", { id }),
  search: (query: string) => apiCall<ClientContact[]>("search_contacts", { query }),
};

// Reminder commands
export const reminderApi = {
  getAll: () => apiCall<Reminder[]>("get_reminders"),
  getPending: () => apiCall<Reminder[]>("get_pending_reminders"),
  getByDocument: (documentType: string, documentId: string) =>
    apiCall<Reminder[]>("get_reminders_by_document", { documentType, documentId }),
  create: (input: CreateReminderInput) =>
    apiCall<Reminder>("create_reminder", { input }),
  markSent: (id: string) => apiCall<Reminder>("mark_reminder_sent", { id }),
  sendEmail: (id: string) => apiCall<Reminder | { mode: "mailto"; to: string; subject: string; body: string }>("send_reminder_email", { id }),
  delete: (id: string) => apiCall<void>("delete_reminder", { id }),
  checkAndCreate: () => apiCall<Reminder[]>("check_and_create_reminders"),
};

// Report commands
export const reportApi = {
  getRevenueByMonth: (startDate?: string, endDate?: string) =>
    apiCall<RevenueByPeriod[]>("get_revenue_by_month", { startDate, endDate }),
  getRevenueByClient: (startDate?: string, endDate?: string) =>
    apiCall<RevenueByClient[]>("get_revenue_by_client", { startDate, endDate }),
  getProductSales: (startDate?: string, endDate?: string) =>
    apiCall<ProductSales[]>("get_product_sales", { startDate, endDate }),
  getOutstandingPayments: () =>
    apiCall<OutstandingPayment[]>("get_outstanding_payments"),
  getQuoteConversionStats: (startDate?: string, endDate?: string) =>
    apiCall<QuoteConversionStats>("get_quote_conversion_stats", { startDate, endDate }),
};

// Alerts commands
export const alertsApi = {
  getSummary: () => apiCall<AlertsSummary>("get_alerts_summary"),
  markQuoteExpired: (quoteId: string) => apiCall<Quote>("mark_quote_expired", { quoteId }),
};

// Import commands (file upload via FormData)
export const importApi = {
  importClients: async (file: File): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE_URL}/api/import/clients`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Failed to import clients");
    }
    return res.json();
  },
  importProducts: async (file: File): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE_URL}/api/import/products`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Failed to import products");
    }
    return res.json();
  },
  importSuppliers: async (file: File): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE_URL}/api/import/suppliers`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Failed to import suppliers");
    }
    return res.json();
  },
};

// Backup import
export const backupApi = {
  importBackup: (data: Record<string, unknown>) =>
    apiCall<{ success: boolean; imported: Record<string, number> }>("import_backup", { data }),
};

// Auth commands
export const authApi = {
  login: (input: LoginInput) => apiCall<UserInfo | { requires_2fa: boolean; challenge_token: string }>("login", { input }),
  logout: () => apiCall<void>("logout"),
  getCurrentUser: () => apiCall<UserInfo | null>("get_current_user"),
  getUsers: () => apiCall<UserInfo[]>("get_users"),
  createUser: (input: CreateUserInput) => apiCall<UserInfo>("create_user_account", { input }),
  updateUser: (input: UpdateUserInput) => apiCall<UserInfo>("update_user_account", { input }),
  deleteUser: (id: string) => apiCall<void>("delete_user_account", { id }),
  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    apiCall<void>("change_own_password", { currentPassword, newPassword }),
  verifyEmail: (token: string) => apiCall<void>("verify_email", { input: { token } }),
  resendVerification: () => apiCall<void>("resend_verification"),
  forgotPassword: (email: string) =>
    apiCall<void>("forgot_password", { input: { email } }),
  resetPassword: (token: string, password: string) =>
    apiCall<void>("reset_password", { input: { token, password } }),
  // TOTP
  totpSetup: () => apiCall<{ secret: string; uri: string }>("totp_setup"),
  totpVerifySetup: (code: string) => apiCall<{ backup_codes: string[] }>("totp_verify_setup", { input: { code } }),
  totpDisable: (password: string) => apiCall<void>("totp_disable", { input: { password } }),
  totpVerify: (challengeToken: string, code: string) => apiCall<UserInfo>("totp_verify", { input: { challenge_token: challengeToken, code } }),
  // Sessions
  getSessions: () => apiCall<Array<{ id: string; user_agent: string | null; ip_address: string | null; last_active_at: string; created_at: string; is_current: boolean }>>("get_sessions"),
  revokeSession: (id: string) => apiCall<void>("revoke_session", { id }),
  revokeAllSessions: () => apiCall<void>("revoke_all_sessions"),
};

// POS commands
export const posApi = {
  // Registers
  getRegisters: () => apiCall<PosRegister[]>("get_pos_registers"),
  getRegister: (id: string) => apiCall<PosRegister>("get_pos_register", { id }),
  createRegister: (input: CreatePosRegisterInput) =>
    apiCall<PosRegister>("create_pos_register", { input }),
  updateRegister: (input: UpdatePosRegisterInput) =>
    apiCall<PosRegister>("update_pos_register", { input }),
  deleteRegister: (id: string) => apiCall<void>("delete_pos_register", { id }),

  // Sessions
  getActiveSession: (registerId: string) =>
    apiCall<PosSession | null>("get_active_pos_session", { registerId }),
  openSession: (input: OpenSessionInput) =>
    apiCall<PosSession>("open_pos_session", { input }),
  closeSession: (input: CloseSessionInput) =>
    apiCall<PosSession>("close_pos_session", { input }),
  getSessionSummary: (sessionId: string) =>
    apiCall<SessionSummary>("get_pos_session_summary", { sessionId }),

  // Transactions
  lookupProductByBarcode: (barcode: string) =>
    apiCall<Product | null>("lookup_product_by_barcode", { barcode }),
  createTransaction: (input: CreatePosTransactionInput) =>
    apiCall<PosTransaction>("create_pos_transaction", { input }),
  getTransaction: (id: string) =>
    apiCall<PosTransaction>("get_pos_transaction", { id }),
  cancelTransaction: (id: string, reason: string) =>
    apiCall<PosTransaction>("cancel_pos_transaction", { id, reason }),
  getSessionTransactions: (sessionId: string) =>
    apiCall<PosTransaction[]>("get_pos_session_transactions", { sessionId }),

  // Cash movements
  createCashMovement: (input: CreateCashMovementInput) =>
    apiCall<PosCashMovement>("create_pos_cash_movement", { input }),
  getSessionCashMovements: (sessionId: string) =>
    apiCall<PosCashMovement[]>("get_pos_session_cash_movements", { sessionId }),

  // Printer configs
  getPrinterConfigs: () => apiCall<PosPrinterConfig[]>("get_pos_printer_configs"),
  createPrinterConfig: (input: CreatePrinterConfigInput) =>
    apiCall<PosPrinterConfig>("create_pos_printer_config", { input }),
  updatePrinterConfig: (input: UpdatePrinterConfigInput) =>
    apiCall<PosPrinterConfig>("update_pos_printer_config", { input }),
  deletePrinterConfig: (id: string) =>
    apiCall<void>("delete_pos_printer_config", { id }),

  // Reports
  getDailyReport: (date: string, registerId?: string) =>
    apiCall<DailyPosReport>("get_daily_pos_report", { date, registerId }),
};

