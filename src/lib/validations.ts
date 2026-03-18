import { z } from "zod";

// ─── Shared helpers ─────────────────────────────────────────────────────────

const optionalString = z.string().nullable().optional();
const optionalEmail = z
  .string()
  .nullable()
  .optional()
  .refine(
    (val) => !val || val.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
    { message: "Invalid email format" }
  );
const requiredString = (field: string) => z.string().min(1, `${field} is required`);
const positiveNumber = z.coerce.number().min(0, "Must be non-negative");

// ─── Auth ───────────────────────────────────────────────────────────────────

export const signupSchema = z.object({
  company_name: requiredString("Company name"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  display_name: requiredString("Display name"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  email: optionalEmail,
});

export const loginSchema = z.object({
  username: requiredString("Username"),
  password: requiredString("Password"),
});

export const createUserSchema = z.object({
  username: requiredString("Username"),
  display_name: requiredString("Display name"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "employee"]).default("employee"),
  permissions: z.array(z.string()).optional(),
});

export const updateUserSchema = z.object({
  username: requiredString("Username"),
  display_name: requiredString("Display name"),
  password: z.string().min(8).optional().or(z.literal("")),
  role: z.enum(["admin", "employee"]),
  is_active: z.boolean(),
  permissions: z.array(z.string()).optional(),
});

// ─── Clients ────────────────────────────────────────────────────────────────

export const clientSchema = z.object({
  name: requiredString("Name"),
  email: optionalEmail,
  phone: optionalString,
  address: optionalString,
  city: optionalString,
  postal_code: optionalString,
  country: optionalString,
  siret: optionalString,
  vat_number: optionalString,
  notes: optionalString,
});

// ─── Products ───────────────────────────────────────────────────────────────

export const productSchema = z.object({
  designation: requiredString("Designation"),
  description: optionalString,
  description_html: optionalString,
  unit_price: positiveNumber,
  tax_rate: z.coerce.number().min(0).max(100, "Tax rate must be 0-100"),
  unit: z.string().default("unit"),
  reference: optionalString,
  barcode: optionalString,
  is_service: z.boolean().default(false),
  category_id: optionalString,
  quantity: z.coerce.number().int().min(0).default(0),
  purchase_price: positiveNumber.default(0),
});

// ─── Categories ─────────────────────────────────────────────────────────────

export const categorySchema = z.object({
  name: requiredString("Name"),
  description: optionalString,
  parent_id: optionalString,
});

// ─── Suppliers ──────────────────────────────────────────────────────────────

export const supplierSchema = z.object({
  name: requiredString("Name"),
  email: optionalEmail,
  phone: optionalString,
  address: optionalString,
  notes: optionalString,
});

// ─── Product Suppliers ──────────────────────────────────────────────────────

export const productSupplierSchema = z.object({
  product_id: requiredString("Product ID"),
  supplier_id: requiredString("Supplier ID"),
  purchase_price: positiveNumber.default(0),
});

// ─── Contacts ───────────────────────────────────────────────────────────────

export const contactSchema = z.object({
  client_id: requiredString("Client ID"),
  name: requiredString("Name"),
  role: optionalString,
  email: optionalEmail,
  phone: optionalString,
  is_primary: z.boolean().default(false),
});

// ─── Expenses ───────────────────────────────────────────────────────────────

export const expenseSchema = z.object({
  name: requiredString("Name"),
  amount: positiveNumber,
  date: requiredString("Date"),
  notes: optionalString,
});

// ─── Document Lines (shared for invoices & quotes) ──────────────────────────

const documentLineSchema = z.object({
  product_id: optionalString,
  description: requiredString("Line description"),
  description_html: optionalString,
  quantity: z.coerce.number().min(0.01, "Quantity must be positive"),
  unit_price: z.coerce.number().min(0, "Unit price must be non-negative"),
  tax_rate: z.coerce.number().min(0).max(100),
  position: z.number().int().optional(),
  group_name: optionalString,
  is_subtotal_line: z.boolean().default(false),
});

// ─── Invoices ───────────────────────────────────────────────────────────────

export const createInvoiceSchema = z.object({
  client_id: requiredString("Client ID"),
  quote_id: optionalString,
  status: z.string().default("DRAFT"),
  issue_date: requiredString("Issue date"),
  due_date: optionalString,
  notes: optionalString,
  notes_html: optionalString,
  shipping_cost: positiveNumber.default(0),
  shipping_tax_rate: z.coerce.number().min(0).max(100).default(20),
  down_payment_percent: positiveNumber.default(0),
  down_payment_amount: positiveNumber.default(0),
  is_down_payment_invoice: z.boolean().default(false),
  parent_quote_id: optionalString,
  lines: z.array(documentLineSchema).min(1, "At least one line is required"),
});

export const updateInvoiceSchema = z.object({
  client_id: requiredString("Client ID"),
  status: requiredString("Status"),
  issue_date: requiredString("Issue date"),
  due_date: requiredString("Due date"),
  notes: optionalString,
  notes_html: optionalString,
  shipping_cost: positiveNumber.default(0),
  shipping_tax_rate: z.coerce.number().min(0).max(100).default(20),
  down_payment_percent: positiveNumber.default(0),
  down_payment_amount: positiveNumber.default(0),
  is_down_payment_invoice: z.boolean().default(false),
  parent_quote_id: optionalString,
  lines: z.array(documentLineSchema).min(1, "At least one line is required"),
});

// ─── Quotes ─────────────────────────────────────────────────────────────────

export const createQuoteSchema = z.object({
  client_id: requiredString("Client ID"),
  status: z.string().default("DRAFT"),
  issue_date: requiredString("Issue date"),
  validity_date: requiredString("Validity date"),
  notes: optionalString,
  notes_html: optionalString,
  shipping_cost: positiveNumber.default(0),
  shipping_tax_rate: z.coerce.number().min(0).max(100).default(20),
  down_payment_percent: positiveNumber.default(0),
  down_payment_amount: positiveNumber.default(0),
  lines: z.array(documentLineSchema).min(1, "At least one line is required"),
});

export const updateQuoteSchema = createQuoteSchema.extend({
  status: requiredString("Status"),
});

// ─── Payments ───────────────────────────────────────────────────────────────

export const paymentSchema = z.object({
  invoice_id: requiredString("Invoice ID"),
  amount: z.coerce.number().min(0.01, "Amount must be positive"),
  payment_date: requiredString("Payment date"),
  payment_method: requiredString("Payment method"),
  reference: optionalString,
  notes: optionalString,
});

// ─── Delivery Notes ─────────────────────────────────────────────────────────

const deliveryNoteLineSchema = z.object({
  product_id: optionalString,
  description: requiredString("Line description"),
  description_html: optionalString,
  quantity: z.coerce.number().min(0.01, "Quantity must be positive"),
  unit: z.string().default("unit"),
  position: z.number().int().optional(),
});

export const createDeliveryNoteSchema = z.object({
  client_id: requiredString("Client ID"),
  quote_id: optionalString,
  invoice_id: optionalString,
  status: z.string().default("DRAFT"),
  issue_date: requiredString("Issue date"),
  delivery_date: optionalString,
  delivery_address: optionalString,
  notes: optionalString,
  notes_html: optionalString,
  lines: z.array(deliveryNoteLineSchema).min(1, "At least one line is required"),
});

export const updateDeliveryNoteSchema = createDeliveryNoteSchema.extend({
  status: requiredString("Status"),
});

// ─── POS ────────────────────────────────────────────────────────────────────

const posLineSchema = z.object({
  product_id: optionalString,
  barcode: optionalString,
  designation: requiredString("Designation"),
  quantity: z.coerce.number().min(0.01, "Quantity must be positive"),
  unit_price: positiveNumber,
  tax_rate: z.coerce.number().min(0).max(100).default(0),
  discount_percent: z.coerce.number().min(0).max(100).default(0),
  position: z.number().int().optional(),
});

const posPaymentSchema = z.object({
  payment_method: z.enum(["CASH", "CARD"], { message: "Must be CASH or CARD" }),
  amount: z.coerce.number().min(0.01, "Amount must be positive"),
  cash_given: z.coerce.number().nullable().optional(),
  change_given: z.coerce.number().nullable().optional(),
  card_reference: optionalString,
});

export const posTransactionSchema = z.object({
  register_id: requiredString("Register ID"),
  session_id: requiredString("Session ID"),
  client_id: optionalString,
  discount_percent: positiveNumber.default(0),
  discount_amount: positiveNumber.default(0),
  notes: optionalString,
  lines: z.array(posLineSchema).min(1, "At least one line is required"),
  payments: z.array(posPaymentSchema).min(1, "At least one payment is required"),
});

export const posSessionCloseSchema = z.object({
  session_id: requiredString("Session ID"),
  actual_cash: z.coerce.number().optional(),
  notes: optionalString,
});

export const posCashMovementSchema = z.object({
  session_id: requiredString("Session ID"),
  movement_type: z.enum(["IN", "OUT"], { message: "Must be IN or OUT" }),
  amount: z.coerce.number().min(0.01, "Amount must be positive"),
  reason: requiredString("Reason"),
  reference: optionalString,
});

// ─── Settings ───────────────────────────────────────────────────────────────

export const settingsSchema = z.object({
  company_name: optionalString,
  address: optionalString,
  city: optionalString,
  postal_code: optionalString,
  country: optionalString,
  phone: optionalString,
  email: optionalEmail,
  website: optionalString,
  siret: optionalString,
  vat_number: optionalString,
  logo_path: optionalString,
  default_tax_rate: z.coerce.number().min(0).max(100).optional(),
  default_payment_terms: z.coerce.number().int().min(0).optional(),
  invoice_prefix: optionalString,
  quote_prefix: optionalString,
  next_invoice_number: z.coerce.number().int().min(1).optional(),
  next_quote_number: z.coerce.number().int().min(1).optional(),
  legal_mentions: optionalString,
  legal_mentions_html: optionalString,
  bank_details: optionalString,
  delivery_note_prefix: optionalString,
  next_delivery_note_number: z.coerce.number().int().min(1).optional(),
  currency: optionalString,
}).partial();

// ─── Admin: Plans ───────────────────────────────────────────────────────────

const planPriceSchema = z.object({
  currency: requiredString("Currency"),
  monthly_price: z.coerce.number().int().min(0),
  yearly_price: z.coerce.number().int().min(0),
});

export const createPlanSchema = z.object({
  slug: requiredString("Slug"),
  name: requiredString("Name"),
  description: optionalString,
  name_translations: z.any().optional(),
  description_translations: z.any().optional(),
  monthly_price: z.coerce.number().int().min(0, "Monthly price must be non-negative"),
  yearly_price: z.coerce.number().int().min(0, "Yearly price must be non-negative"),
  currency: z.string().default("DZD"),
  trial_days: z.coerce.number().int().min(0).default(0),
  sort_order: z.coerce.number().int().default(0),
  prices: z.array(planPriceSchema).optional(),
  quotas: z.array(z.object({
    quota_key: z.string().min(1),
    limit_value: z.coerce.number().int().min(0),
  })).optional(),
});

export const updatePlanSchema = createPlanSchema.partial();

// ─── Admin: Coupons ─────────────────────────────────────────────────────────

export const createCouponSchema = z.object({
  code: requiredString("Code"),
  discount_type: z.enum(["percentage", "fixed"], { message: "Must be 'percentage' or 'fixed'" }),
  discount_value: z.coerce.number().int().min(1, "Discount value must be positive"),
  currency: z.string().default("DZD"),
  max_uses: z.coerce.number().int().min(1).nullable().optional(),
  expires_at: optionalString,
  is_active: z.boolean().default(true),
  plan_ids: z.array(z.string()).optional(),
});

export const updateCouponSchema = createCouponSchema.partial();

// ─── Admin: Feature Flags ───────────────────────────────────────────────────

export const createFeatureSchema = z.object({
  key: requiredString("Key"),
  name: requiredString("Name"),
  description: optionalString,
  name_translations: z.any().optional(),
  description_translations: z.any().optional(),
  is_global: z.boolean().default(true),
  plan_ids: z.array(z.string()).optional(),
});

export const updateFeatureSchema = createFeatureSchema.partial();

// ─── Admin: Announcements ───────────────────────────────────────────────────

export const createAnnouncementSchema = z.object({
  title: requiredString("Title"),
  body: requiredString("Body"),
  body_html: optionalString,
  target_type: z.enum(["all", "plan", "tenant"]).default("all"),
  target_id: optionalString,
  published_at: optionalString,
  expires_at: optionalString,
});

export const updateAnnouncementSchema = createAnnouncementSchema.partial();

// ─── Admin: Tenants ─────────────────────────────────────────────────────────

export const updateTenantSchema = z.object({
  name: optionalString,
  slug: optionalString,
}).refine((data) => data.name || data.slug, {
  message: "At least one field (name or slug) must be provided",
});

// ─── Auth: Additional ──────────────────────────────────────────────────────

export const changePasswordSchema = z.object({
  current_password: requiredString("Current password"),
  new_password: z.string().min(8, "Password must be at least 8 characters"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Email is required").refine(
    (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
    { message: "Invalid email format" }
  ),
});

export const resetPasswordSchema = z.object({
  token: requiredString("Token"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const verifyEmailSchema = z.object({
  token: requiredString("Token"),
});

export const totpDisableSchema = z.object({
  password: requiredString("Password"),
});

export const totpVerifySchema = z.object({
  challenge_token: requiredString("Challenge token"),
  code: requiredString("Code"),
});

export const totpVerifySetupSchema = z.object({
  code: requiredString("Code"),
});

// ─── Admin: Additional ─────────────────────────────────────────────────────

export const adminLoginSchema = z.object({
  username: requiredString("Username"),
  password: requiredString("Password"),
});

export const createPlatformAdminSchema = z.object({
  username: requiredString("Username"),
  email: z.string().min(1, "Email is required").refine(
    (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
    { message: "Invalid email format" }
  ),
  password: z.string().min(6, "Password must be at least 6 characters"),
  display_name: optionalString,
  role: z.enum(["super_admin", "support_agent"]).default("support_agent"),
});

export const updatePlatformAdminSchema = z.object({
  username: optionalString,
  display_name: optionalString,
  email: optionalEmail,
  role: z.enum(["super_admin", "support_agent"]).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).optional(),
}).partial();

export const adminResetPasswordSchema = z.object({
  new_password: z.string().min(6, "Password must be at least 6 characters"),
});

export const createDataRequestSchema = z.object({
  tenant_id: requiredString("Tenant ID"),
  request_type: z.enum(["export", "deletion"], { message: "Must be 'export' or 'deletion'" }),
  notes: optionalString,
});

export const updateTenantFeaturesSchema = z.object({
  features: z.array(z.object({
    feature_id: requiredString("Feature ID"),
    enabled: z.boolean(),
  })).min(1, "At least one feature is required"),
});

export const markInvoicePaidSchema = z.object({
  payment_method: optionalString,
}).optional();

export const subscriptionRequestApproveSchema = z.object({
  admin_notes: optionalString,
}).optional();

export const subscriptionRequestRejectSchema = z.object({
  admin_notes: optionalString,
}).optional();

// ─── Subscription ──────────────────────────────────────────────────────────

export const subscriptionRequestSchema = z.object({
  plan_id: requiredString("Plan ID"),
  billing_cycle: requiredString("Billing cycle"),
  request_type: z.enum(["new", "upgrade", "downgrade", "renewal"], { message: "Invalid request type" }),
  coupon_code: optionalString,
  currency: z.string().default("DZD"),
});

export const validateCouponSchema = z.object({
  code: requiredString("Coupon code"),
  plan_id: requiredString("Plan ID"),
});

// ─── Invoices: Additional ──────────────────────────────────────────────────

export const invoiceFromDeliveryNotesSchema = z.object({
  delivery_note_ids: z.array(z.string()).min(1, "At least one delivery note ID is required"),
});

export const invoiceMarkPaidSchema = z.object({
  payment_method: z.string().default("other"),
  reference: optionalString,
  notes: optionalString,
}).optional();

// ─── Payments: Update ──────────────────────────────────────────────────────

export const updatePaymentSchema = z.object({
  amount: z.coerce.number().min(0.01, "Amount must be positive"),
  payment_date: requiredString("Payment date"),
  payment_method: requiredString("Payment method"),
  reference: optionalString,
  notes: optionalString,
});

// ─── Reminders ─────────────────────────────────────────────────────────────

export const reminderSchema = z.object({
  reminder_type: requiredString("Reminder type"),
  document_type: requiredString("Document type"),
  document_id: requiredString("Document ID"),
  scheduled_date: requiredString("Scheduled date"),
  message: optionalString,
});

// ─── Settings: App ─────────────────────────────────────────────────────────

export const appSettingsSchema = z.object({
  app_language: optionalString,
  app_theme: optionalString,
  currency: optionalString,
}).partial();

// ─── Product Suppliers: Update ─────────────────────────────────────────────

export const updateProductSupplierSchema = z.object({
  product_id: requiredString("Product ID"),
  supplier_id: requiredString("Supplier ID"),
  purchase_price: positiveNumber.default(0),
});

export const updateProductSupplierPriceSchema = z.object({
  purchase_price: positiveNumber,
});

// ─── POS: Registers ────────────────────────────────────────────────────────

export const posRegisterSchema = z.object({
  name: requiredString("Name"),
  location: optionalString,
  is_active: z.boolean().default(true),
});

export const updatePosRegisterSchema = z.object({
  name: requiredString("Name"),
  location: optionalString,
  is_active: z.boolean(),
});

// ─── POS: Printers ─────────────────────────────────────────────────────────

export const posPrinterSchema = z.object({
  printer_name: requiredString("Printer name"),
  connection_type: requiredString("Connection type"),
  connection_address: requiredString("Connection address"),
  register_id: optionalString,
  paper_width: z.coerce.number().int().default(80),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export const updatePosPrinterSchema = z.object({
  printer_name: requiredString("Printer name"),
  connection_type: requiredString("Connection type"),
  connection_address: requiredString("Connection address"),
  register_id: optionalString,
  paper_width: z.coerce.number().int().default(80),
  is_default: z.boolean(),
  is_active: z.boolean(),
});

// ─── POS: Sessions ─────────────────────────────────────────────────────────

export const posSessionOpenSchema = z.object({
  register_id: requiredString("Register ID"),
  opening_float: z.coerce.number().min(0).default(0),
  notes: optionalString,
});

// ─── POS: Transaction Cancel ───────────────────────────────────────────────

export const posTransactionCancelSchema = z.object({
  reason: optionalString,
}).optional();

// ─── Batch Delete ──────────────────────────────────────────────────────────

export const batchDeleteSchema = z.array(z.string().min(1)).min(1, "At least one ID is required");

// ─── Import Backup ─────────────────────────────────────────────────────────

export const importBackupSchema = z.object({
  version: z.any(),
  product_categories: z.array(z.any()).optional(),
  products: z.array(z.any()).optional(),
  clients: z.array(z.any()).optional(),
  client_contacts: z.array(z.any()).optional(),
  suppliers: z.array(z.any()).optional(),
  product_suppliers: z.array(z.any()).optional(),
  quotes: z.array(z.any()).optional(),
  invoices: z.array(z.any()).optional(),
  payments: z.array(z.any()).optional(),
  delivery_notes: z.array(z.any()).optional(),
  expenses: z.array(z.any()).optional(),
  reminders: z.array(z.any()).optional(),
  settings: z.any().optional(),
});
