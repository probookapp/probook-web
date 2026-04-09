// Client types
export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  siret: string | null;
  vat_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateClientInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  siret?: string | null;
  vat_number?: string | null;
  notes?: string | null;
}

export interface UpdateClientInput extends CreateClientInput {
  id: string;
}

// Product Category types
export interface ProductCategory {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProductCategoryInput {
  name: string;
  description?: string | null;
  parent_id?: string | null;
}

export interface UpdateProductCategoryInput extends CreateProductCategoryInput {
  id: string;
}

// Product types
export interface ProductPrice {
  id: string;
  product_id: string;
  label: string;
  price: number;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  designation: string;
  description: string | null;
  description_html: string | null;
  unit_price: number;
  tax_rate: number;
  unit: string;
  reference: string | null;
  barcode: string | null;
  is_service: boolean;
  // Phase 3: Category and photo
  category_id: string | null;
  photo_path: string | null;
  // Stock management
  quantity: number | null;
  purchase_price: number | null;
  // Multi-tier pricing
  prices?: ProductPrice[];
  // Variants
  has_variants: boolean;
  variants?: ProductVariant[];
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  attributes: Record<string, string>;
  quantity: number;
  price_override: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateProductVariantInput {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  attributes: Record<string, string>;
  quantity?: number;
  price_override?: number | null;
}

export interface UpdateProductVariantInput extends CreateProductVariantInput {
  id: string;
  is_active?: boolean;
}

export interface CreateProductInput {
  designation: string;
  description?: string | null;
  description_html?: string | null;
  unit_price: number;
  tax_rate: number;
  unit: string;
  reference?: string | null;
  barcode?: string | null;
  is_service: boolean;
  category_id?: string | null;
  quantity?: number | null;
  purchase_price?: number | null;
  prices?: { label: string; price: number }[];
  has_variants?: boolean;
}

export interface UpdateProductInput extends CreateProductInput {
  id: string;
}

// Purchase Order types
export type PurchaseOrderStatus = "PENDING" | "CONFIRMED" | "CANCELLED";
export type PurchasePaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export interface PurchaseOrder {
  id: string;
  order_number: string;
  supplier_id: string;
  supplier?: Supplier;
  status: PurchaseOrderStatus;
  order_date: string;
  confirmed_date: string | null;
  paid_from_register: boolean;
  register_id: string | null;
  session_id: string | null;
  payment_status: PurchasePaymentStatus;
  subtotal: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  lines: PurchaseOrderLine[];
  payments?: SupplierPayment[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderLine {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  previous_price: number | null;
  use_average_price: boolean;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  product?: Product;
  variant?: ProductVariant;
}

export interface CreatePurchaseOrderInput {
  supplier_id: string;
  order_date?: string;
  notes?: string | null;
  lines: CreatePurchaseOrderLineInput[];
}

export interface CreatePurchaseOrderLineInput {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  unit_price: number;
  previous_price?: number | null;
  use_average_price?: boolean;
  tax_rate?: number;
}

export interface UpdatePurchaseOrderInput extends CreatePurchaseOrderInput {
  id: string;
}

export interface ConfirmPurchaseOrderInput {
  paid_from_register: boolean;
  register_id?: string | null;
  session_id?: string | null;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  purchase_order_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export interface CreateSupplierPaymentInput {
  amount: number;
  payment_date: string;
  payment_method: string;
  purchase_order_id?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface SupplierCreditSummary {
  supplier_id: string;
  supplier_name: string;
  total_owed: number;
  total_paid: number;
  balance: number;
  unpaid_orders: PurchaseOrder[];
}

// Quote types
export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "EXPIRED";

export interface Quote {
  id: string;
  quote_number: string;
  client_id: string;
  client?: Client;
  status: QuoteStatus;
  issue_date: string;
  validity_date: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  notes_html: string | null;
  logo_snapshot: string | null;
  // Phase 2: Shipping costs
  shipping_cost: number;
  shipping_tax_rate: number;
  // Phase 2: Down payment
  down_payment_percent: number;
  down_payment_amount: number;
  lines: QuoteLine[];
  created_at: string;
  updated_at: string;
}

export interface QuoteLine {
  id: string;
  quote_id: string;
  product_id: string | null;
  product?: Product;
  description: string;
  description_html: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  position: number;
  // Phase 2: Subtotals
  group_name: string | null;
  is_subtotal_line: boolean | null;
}

export interface CreateQuoteInput {
  client_id: string;
  issue_date: string;
  validity_date: string;
  notes?: string | null;
  notes_html?: string | null;
  shipping_cost?: number;
  shipping_tax_rate?: number;
  down_payment_percent?: number;
  down_payment_amount?: number;
  lines: CreateQuoteLineInput[];
}

export interface CreateQuoteLineInput {
  product_id?: string | null;
  description: string;
  description_html?: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  group_name?: string | null;
  is_subtotal_line?: boolean;
}

export interface UpdateQuoteInput extends CreateQuoteInput {
  id: string;
  status: QuoteStatus;
}

// Invoice types
export type InvoiceStatus = "DRAFT" | "ISSUED" | "PAID";

export interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string;
  client?: Client;
  quote_id: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  notes_html: string | null;
  integrity_hash: string | null;
  logo_snapshot: string | null;
  // Phase 2: Shipping costs
  shipping_cost: number;
  shipping_tax_rate: number;
  // Phase 2: Down payment
  down_payment_percent: number;
  down_payment_amount: number;
  is_down_payment_invoice: boolean;
  parent_quote_id: string | null;
  lines: InvoiceLine[];
  payments: Payment[];
  created_at: string;
  updated_at: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  product_id: string | null;
  product?: Product;
  description: string;
  description_html: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  position: number;
  // Phase 2: Subtotals
  group_name: string | null;
  is_subtotal_line: boolean | null;
}

export interface CreateInvoiceInput {
  client_id: string;
  quote_id?: string | null;
  issue_date: string;
  due_date: string;
  notes?: string | null;
  notes_html?: string | null;
  shipping_cost?: number;
  shipping_tax_rate?: number;
  down_payment_percent?: number;
  down_payment_amount?: number;
  is_down_payment_invoice?: boolean;
  parent_quote_id?: string | null;
  lines: CreateInvoiceLineInput[];
}

export interface CreateInvoiceLineInput {
  product_id?: string | null;
  description: string;
  description_html?: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  group_name?: string | null;
  is_subtotal_line?: boolean;
}

export interface UpdateInvoiceInput {
  id: string;
  client_id: string;
  issue_date: string;
  due_date: string;
  notes?: string | null;
  notes_html?: string | null;
  shipping_cost?: number;
  shipping_tax_rate?: number;
  down_payment_percent?: number;
  down_payment_amount?: number;
  lines: CreateInvoiceLineInput[];
}

// Payment types
export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export interface CreatePaymentInput {
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference?: string | null;
  notes?: string | null;
}

// Company Settings types
export interface CompanySettings {
  id: string;
  company_name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  siret: string | null;
  vat_number: string | null;
  logo_path: string | null;
  default_tax_rate: number;
  default_payment_terms: number;
  invoice_prefix: string;
  quote_prefix: string;
  next_invoice_number: number;
  next_quote_number: number;
  legal_mentions: string | null;
  legal_mentions_html: string | null;
  bank_details: string | null;
  // Phase 4: Delivery notes
  delivery_note_prefix: string | null;
  next_delivery_note_number: number | null;
  // App preferences
  app_language: string | null;
  app_theme: string | null;
  // Currency
  currency: string | null;
  updated_at: string;
}

export interface UpdateCompanySettingsInput {
  company_name: string;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  siret?: string | null;
  vat_number?: string | null;
  default_tax_rate: number;
  default_payment_terms: number;
  invoice_prefix: string;
  quote_prefix: string;
  legal_mentions?: string | null;
  legal_mentions_html?: string | null;
  bank_details?: string | null;
  delivery_note_prefix?: string | null;
  currency?: string | null;
}

export interface UpdateAppSettingsInput {
  app_language: string;
  app_theme: string;
}

// Expense types
export interface Expense {
  id: string;
  name: string;
  amount: number;
  date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseInput {
  name: string;
  amount: number;
  date: string;
  notes?: string | null;
}

export interface UpdateExpenseInput extends CreateExpenseInput {
  id: string;
}

// Supplier types
export interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface UpdateSupplierInput extends CreateSupplierInput {
  id: string;
}

// Product-Supplier types
export interface ProductSupplier {
  id: string;
  product_id: string;
  supplier_id: string;
  purchase_price: number;
  created_at: string;
}

export interface CreateProductSupplierInput {
  product_id: string;
  supplier_id: string;
  purchase_price: number;
}

export interface SupplierWithPrice {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  purchase_price: number;
  link_id: string;
}

export interface ProductWithPrice {
  id: string;
  designation: string;
  reference: string | null;
  unit_price: number;
  purchase_price: number;
  link_id: string;
}

export interface ProductSupplierSummary {
  product_id: string;
  supplier_id: string;
  supplier_name: string;
}

// Statistics types
export interface DashboardStats {
  total_clients: number;
  total_invoices: number;
  total_quotes: number;
  revenue_this_month: number;
  revenue_this_year: number;
  pending_payments: number;
  total_expenses: number;
  profit: number;
  recent_invoices: Invoice[];
  recent_quotes: Quote[];
}

// Delivery Note types
export type DeliveryNoteStatus = "DRAFT" | "DELIVERED" | "CANCELLED";

export interface DeliveryNote {
  id: string;
  delivery_note_number: string;
  client_id: string;
  client?: Client;
  quote_id: string | null;
  invoice_id: string | null;
  status: DeliveryNoteStatus;
  issue_date: string;
  delivery_date: string | null;
  delivery_address: string | null;
  notes: string | null;
  notes_html: string | null;
  lines: DeliveryNoteLine[];
  created_at: string;
  updated_at: string;
}

export interface DeliveryNoteLine {
  id: string;
  delivery_note_id: string;
  product_id: string | null;
  description: string;
  description_html: string | null;
  quantity: number;
  unit: string | null;
  position: number;
  created_at: string;
}

export interface CreateDeliveryNoteInput {
  client_id: string;
  quote_id?: string | null;
  invoice_id?: string | null;
  issue_date: string;
  delivery_date?: string | null;
  delivery_address?: string | null;
  notes?: string | null;
  notes_html?: string | null;
  lines: CreateDeliveryNoteLineInput[];
}

export interface CreateDeliveryNoteLineInput {
  product_id?: string | null;
  description: string;
  description_html?: string | null;
  quantity: number;
  unit?: string | null;
}

export interface UpdateDeliveryNoteInput extends CreateDeliveryNoteInput {
  id: string;
  status: DeliveryNoteStatus;
}

// Client Contact types
export interface ClientContact {
  id: string;
  client_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateClientContactInput {
  client_id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary: boolean;
}

export interface UpdateClientContactInput {
  id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary: boolean;
}

// Reminder types
export type ReminderType = "PAYMENT_DUE" | "QUOTE_EXPIRING" | "DELIVERY_SCHEDULED" | "CUSTOM";
export type DocumentType = "INVOICE" | "QUOTE" | "DELIVERY_NOTE";

export interface Reminder {
  id: string;
  reminder_type: ReminderType;
  document_type: DocumentType;
  document_id: string;
  scheduled_date: string;
  sent_at: string | null;
  message: string | null;
  created_at: string;
}

export interface CreateReminderInput {
  reminder_type: ReminderType;
  document_type: DocumentType;
  document_id: string;
  scheduled_date: string;
  message?: string | null;
}

// Report types
export interface RevenueByPeriod {
  period: string;
  revenue_before_tax: number;
  revenue_total: number;
  invoice_count: number;
}

export interface RevenueByClient {
  client_id: string;
  client_name: string;
  revenue_before_tax: number;
  revenue_total: number;
  invoice_count: number;
}

export interface ProductSales {
  product_id: string;
  product_name: string;
  quantity_sold: number;
  revenue_before_tax: number;
  revenue_total: number;
}

export interface OutstandingPayment {
  invoice_id: string;
  invoice_number: string;
  client_name: string;
  issue_date: string;
  due_date: string;
  total: number;
  days_overdue: number;
}

export interface QuoteConversionStats {
  total_quotes: number;
  converted_quotes: number;
  conversion_rate: number;
  total_quoted_amount: number;
  converted_amount: number;
}

// App Settings types
export type AppLanguage = 'system' | 'fr' | 'en' | 'ar';
export type AppTheme = 'system' | 'light' | 'dark';

// Alerts
export interface Alert {
  id: string;
  alert_type: "OVERDUE_INVOICE" | "DUE_SOON" | "EXPIRING_QUOTE" | "EXPIRED_QUOTE";
  title: string;
  message: string;
  document_type: "invoice" | "quote";
  document_id: string;
  document_number: string;
  client_name: string;
  amount: number | null;
  date: string;
  days: number; // Positive = overdue, Negative = days until
  severity: "info" | "warning" | "danger";
}

export interface AlertsSummary {
  overdue_invoices: Alert[];
  due_soon_invoices: Alert[];
  expiring_quotes: Alert[];
  expired_quotes: Alert[];
  total_overdue_amount: number;
  total_count: number;
}

// Import types
export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// Auth types
export type UserRole = 'admin' | 'employee';

export type PermissionKey =
  | 'dashboard'
  | 'clients'
  | 'products'
  | 'suppliers'
  | 'quotes'
  | 'invoices'
  | 'delivery_notes'
  | 'phonebook'
  | 'reports'
  | 'expenses'
  | 'purchases'
  | 'settings'
  | 'pos';

export const ALL_PERMISSIONS: PermissionKey[] = [
  'dashboard',
  'clients',
  'products',
  'suppliers',
  'quotes',
  'invoices',
  'delivery_notes',
  'phonebook',
  'reports',
  'expenses',
  'purchases',
  'settings',
  'pos',
];

export interface UserInfo {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface CreateUserInput {
  username: string;
  display_name: string;
  password: string;
  role: string;
  permissions: string[];
}

export interface UpdateUserInput {
  id: string;
  username: string;
  display_name: string;
  password?: string | null;
  role: string;
  is_active: boolean;
  permissions: string[];
}

// ========== POS Types ==========

export interface PosRegister {
  id: string;
  name: string;
  location: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePosRegisterInput {
  name: string;
  location?: string | null;
}

export interface UpdatePosRegisterInput extends CreatePosRegisterInput {
  id: string;
  is_active: boolean;
}

export type PosSessionStatus = "OPEN" | "CLOSED";

export interface PosSession {
  id: string;
  register_id: string;
  user_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  expected_cash: number | null;
  actual_cash: number | null;
  cash_difference: number | null;
  status: PosSessionStatus;
  notes: string | null;
  created_at: string;
}

export interface OpenSessionInput {
  register_id: string;
  opening_float: number;
}

export interface CloseSessionInput {
  session_id: string;
  actual_cash: number;
  notes?: string | null;
}

export type PosTransactionStatus = "PENDING" | "COMPLETED" | "CANCELLED" | "REFUNDED";

export interface PosTransaction {
  id: string;
  ticket_number: string;
  register_id: string;
  session_id: string;
  client_id: string | null;
  user_id: string;
  invoice_id: string | null;
  transaction_date: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  discount_percent: number;
  discount_amount: number;
  final_amount: number;
  status: PosTransactionStatus;
  notes: string | null;
  lines: PosTransactionLine[];
  payments: PosPayment[];
  created_at: string;
  updated_at: string;
}

export interface PosTransactionLine {
  id: string;
  transaction_id: string;
  product_id: string | null;
  variant_id: string | null;
  barcode: string | null;
  designation: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  discount_percent: number;
  position: number;
  created_at: string;
}

export interface CreateTransactionLineInput {
  product_id?: string | null;
  variant_id?: string | null;
  barcode?: string | null;
  designation: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_percent?: number;
}

export type PosPaymentMethod = "CASH" | "CARD";

export interface PosPayment {
  id: string;
  transaction_id: string;
  payment_method: PosPaymentMethod;
  amount: number;
  cash_given: number | null;
  change_given: number | null;
  card_reference: string | null;
  created_at: string;
}

export interface CreatePosPaymentInput {
  payment_method: PosPaymentMethod;
  amount: number;
  cash_given?: number;
  card_reference?: string;
}

export interface CreatePosTransactionInput {
  register_id: string;
  session_id: string;
  client_id?: string | null;
  lines: CreateTransactionLineInput[];
  payments: CreatePosPaymentInput[];
  discount_percent?: number;
  discount_amount?: number;
  notes?: string | null;
}

export type CashMovementType = "CASH_IN" | "CASH_OUT" | "PETTY_CASH";

export interface PosCashMovement {
  id: string;
  session_id: string;
  user_id: string;
  movement_type: CashMovementType;
  amount: number;
  reason: string;
  reference: string | null;
  created_at: string;
}

export interface CreateCashMovementInput {
  session_id: string;
  movement_type: CashMovementType;
  amount: number;
  reason: string;
  reference?: string | null;
}

export type PrinterConnectionType = "Network";

export interface PosPrinterConfig {
  id: string;
  register_id: string | null;
  printer_name: string;
  connection_type: PrinterConnectionType;
  connection_address: string;
  paper_width: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePrinterConfigInput {
  register_id?: string | null;
  printer_name: string;
  connection_type: PrinterConnectionType;
  connection_address: string;
  paper_width: number;
  is_default: boolean;
}

export interface UpdatePrinterConfigInput extends CreatePrinterConfigInput {
  id: string;
  is_active: boolean;
}

export interface SessionSummary {
  session: PosSession;
  register_name: string;
  user_name: string;
  transaction_count: number;
  total_sales: number;
  subtotal: number;
  tax_amount: number;
  cash_sales: number;
  card_sales: number;
  cancelled_count: number;
  cancelled_total: number;
  cash_movements: PosCashMovement[];
  net_cash_movement: number;
}

export interface DailyPosReport {
  date: string;
  register_id: string | null;
  register_name: string | null;
  session_count: number;
  transaction_count: number;
  total_sales: number;
  subtotal: number;
  tax_amount: number;
  cash_sales: number;
  card_sales: number;
  cancelled_count: number;
  cancelled_total: number;
}


