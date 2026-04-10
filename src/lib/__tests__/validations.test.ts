import { describe, it, expect } from "vitest";
import {
  signupSchema,
  loginSchema,
  createUserSchema,
  updateUserSchema,
  clientSchema,
  productSchema,
  productVariantSchema,
  purchaseOrderSchema,
  supplierPaymentSchema,
  categorySchema,
  supplierSchema,
  contactSchema,
  expenseSchema,
  createInvoiceSchema,
  updateInvoiceSchema,
  createQuoteSchema,
  paymentSchema,
  createDeliveryNoteSchema,
  posTransactionSchema,
  posSessionCloseSchema,
  posCashMovementSchema,
  settingsSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  batchDeleteSchema,
  posRegisterSchema,
  posPrinterSchema,
  subscriptionRequestSchema,
  validateCouponSchema,
  reminderSchema,
  productSupplierSchema,
  invoiceFromDeliveryNotesSchema,
} from "../validations";

// Helper: expect schema to pass
function expectValid(schema: { safeParse: (d: unknown) => { success: boolean } }, data: unknown) {
  const result = schema.safeParse(data);
  expect(result.success).toBe(true);
}

// Helper: expect schema to fail
function expectInvalid(schema: { safeParse: (d: unknown) => { success: boolean } }, data: unknown) {
  const result = schema.safeParse(data);
  expect(result.success).toBe(false);
}

// ─── Auth Schemas ──────────────────────────────────────────────────────────

describe("signupSchema", () => {
  const valid = {
    company_name: "Acme",
    username: "john",
    display_name: "John Doe",
    password: "securepass",
  };

  it("accepts valid signup data", () => expectValid(signupSchema, valid));
  it("accepts signup with optional email", () => expectValid(signupSchema, { ...valid, email: "a@b.com" }));
  it("rejects empty company name", () => expectInvalid(signupSchema, { ...valid, company_name: "" }));
  it("rejects short username (< 3 chars)", () => expectInvalid(signupSchema, { ...valid, username: "ab" }));
  it("rejects short password (< 8 chars)", () => expectInvalid(signupSchema, { ...valid, password: "short" }));
  it("rejects invalid email format", () => expectInvalid(signupSchema, { ...valid, email: "not-email" }));
  it("accepts null email", () => expectValid(signupSchema, { ...valid, email: null }));
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => expectValid(loginSchema, { username: "admin", password: "pass" }));
  it("rejects missing username", () => expectInvalid(loginSchema, { username: "", password: "pass" }));
  it("rejects missing password", () => expectInvalid(loginSchema, { username: "admin", password: "" }));
});

describe("createUserSchema", () => {
  const valid = { username: "user1", display_name: "User One", password: "12345678" };

  it("accepts valid data with default role", () => {
    const result = createUserSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.role).toBe("employee");
  });

  it("accepts admin role", () => expectValid(createUserSchema, { ...valid, role: "admin" }));
  it("rejects invalid role", () => expectInvalid(createUserSchema, { ...valid, role: "superuser" }));
  it("rejects password shorter than 8", () => expectInvalid(createUserSchema, { ...valid, password: "short" }));
});

describe("changePasswordSchema", () => {
  it("accepts valid data", () => expectValid(changePasswordSchema, { current_password: "old", new_password: "12345678" }));
  it("rejects short new password", () => expectInvalid(changePasswordSchema, { current_password: "old", new_password: "short" }));
});

describe("forgotPasswordSchema", () => {
  it("accepts valid email", () => expectValid(forgotPasswordSchema, { email: "user@example.com" }));
  it("rejects invalid email", () => expectInvalid(forgotPasswordSchema, { email: "not-email" }));
  it("rejects empty email", () => expectInvalid(forgotPasswordSchema, { email: "" }));
});

describe("resetPasswordSchema", () => {
  it("accepts valid data", () => expectValid(resetPasswordSchema, { token: "abc123", password: "newpass12" }));
  it("rejects short password", () => expectInvalid(resetPasswordSchema, { token: "abc123", password: "short" }));
});

// ─── Client Schema ─────────────────────────────────────────────────────────

describe("clientSchema", () => {
  it("accepts minimal client (name only)", () => expectValid(clientSchema, { name: "Client A" }));

  it("accepts full client data", () =>
    expectValid(clientSchema, {
      name: "Client A",
      email: "client@example.com",
      phone: "+213 555 1234",
      address: "123 Main St",
      city: "Algiers",
      postal_code: "16000",
      country: "DZ",
      siret: "123456789",
      vat_number: "FR12345",
      notes: "VIP client",
    }));

  it("rejects empty name", () => expectInvalid(clientSchema, { name: "" }));
  it("rejects missing name", () => expectInvalid(clientSchema, {}));
  it("rejects invalid email", () => expectInvalid(clientSchema, { name: "C", email: "bad" }));
  it("accepts null for optional fields", () =>
    expectValid(clientSchema, { name: "C", email: null, phone: null }));
});

// ─── Product Schema ────────────────────────────────────────────────────────

describe("productSchema", () => {
  const valid = { designation: "Widget", unit_price: 99.99, tax_rate: 19 };

  it("accepts minimal product", () => expectValid(productSchema, valid));

  it("applies defaults correctly", () => {
    const result = productSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tax_rate).toBeDefined();
      expect(result.data.is_service).toBe(false);
      expect(result.data.quantity).toBe(0);
    }
  });

  it("rejects negative unit_price", () => expectInvalid(productSchema, { ...valid, unit_price: -1 }));
  it("rejects tax_rate > 100", () => expectInvalid(productSchema, { ...valid, tax_rate: 101 }));
  it("rejects missing designation", () => expectInvalid(productSchema, { unit_price: 10 }));

  it("accepts product with prices array", () =>
    expectValid(productSchema, {
      ...valid,
      prices: [{ label: "Wholesale", price: 80 }],
    }));

  it("rejects prices with empty label", () =>
    expectInvalid(productSchema, {
      ...valid,
      prices: [{ label: "", price: 80 }],
    }));

  it("coerces string unit_price to number", () => {
    const result = productSchema.safeParse({ ...valid, unit_price: "50" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.unit_price).toBe(50);
  });
});

describe("productVariantSchema", () => {
  it("accepts valid variant", () =>
    expectValid(productVariantSchema, { name: "Red / Large" }));

  it("applies defaults", () => {
    const result = productVariantSchema.safeParse({ name: "V1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe(0);
      expect(result.data.is_active).toBe(true);
    }
  });

  it("rejects missing name", () => expectInvalid(productVariantSchema, {}));
});

// ─── Supplier Schema ──────────────────────────────────────────────────────

describe("supplierSchema", () => {
  it("accepts minimal supplier", () => expectValid(supplierSchema, { name: "Supplier A" }));
  it("rejects empty name", () => expectInvalid(supplierSchema, { name: "" }));
  it("rejects invalid email", () => expectInvalid(supplierSchema, { name: "S", email: "bad" }));
});

// ─── Category Schema ──────────────────────────────────────────────────────

describe("categorySchema", () => {
  it("accepts valid category", () => expectValid(categorySchema, { name: "Electronics" }));
  it("accepts category with parent", () =>
    expectValid(categorySchema, { name: "Phones", parent_id: "cat-1" }));
  it("rejects empty name", () => expectInvalid(categorySchema, { name: "" }));
});

// ─── Contact Schema ───────────────────────────────────────────────────────

describe("contactSchema", () => {
  it("accepts valid contact", () =>
    expectValid(contactSchema, { client_id: "c1", name: "Jane" }));
  it("rejects missing client_id", () =>
    expectInvalid(contactSchema, { name: "Jane" }));
  it("rejects missing name", () =>
    expectInvalid(contactSchema, { client_id: "c1" }));
});

// ─── Expense Schema ───────────────────────────────────────────────────────

describe("expenseSchema", () => {
  const valid = { name: "Office rent", amount: 500, date: "2024-01-15" };

  it("accepts valid expense", () => expectValid(expenseSchema, valid));
  it("rejects negative amount", () => expectInvalid(expenseSchema, { ...valid, amount: -10 }));
  it("rejects missing date", () => expectInvalid(expenseSchema, { name: "X", amount: 10 }));
});

// ─── Invoice Schema ───────────────────────────────────────────────────────

describe("createInvoiceSchema", () => {
  const validLine = { description: "Service", quantity: 1, unit_price: 100, tax_rate: 20 };
  const valid = {
    client_id: "c1",
    issue_date: "2024-01-15",
    lines: [validLine],
  };

  it("accepts valid invoice", () => expectValid(createInvoiceSchema, valid));
  it("rejects missing client_id", () => expectInvalid(createInvoiceSchema, { ...valid, client_id: "" }));
  it("rejects empty lines", () => expectInvalid(createInvoiceSchema, { ...valid, lines: [] }));
  it("rejects line with zero quantity", () =>
    expectInvalid(createInvoiceSchema, {
      ...valid,
      lines: [{ ...validLine, quantity: 0 }],
    }));
  it("rejects line with negative unit_price", () =>
    expectInvalid(createInvoiceSchema, {
      ...valid,
      lines: [{ ...validLine, unit_price: -5 }],
    }));
  it("rejects line with tax_rate > 100", () =>
    expectInvalid(createInvoiceSchema, {
      ...valid,
      lines: [{ ...validLine, tax_rate: 150 }],
    }));
  it("applies default status DRAFT", () => {
    const result = createInvoiceSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("DRAFT");
  });
  it("applies default shipping_cost 0", () => {
    const result = createInvoiceSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.shipping_cost).toBe(0);
  });
});

// ─── Quote Schema ─────────────────────────────────────────────────────────

describe("createQuoteSchema", () => {
  const validLine = { description: "Product", quantity: 2, unit_price: 50, tax_rate: 19 };
  const valid = {
    client_id: "c1",
    issue_date: "2024-06-01",
    validity_date: "2024-07-01",
    lines: [validLine],
  };

  it("accepts valid quote", () => expectValid(createQuoteSchema, valid));
  it("rejects missing validity_date", () =>
    expectInvalid(createQuoteSchema, { ...valid, validity_date: undefined }));
  it("rejects empty lines", () => expectInvalid(createQuoteSchema, { ...valid, lines: [] }));
});

// ─── Delivery Note Schema ─────────────────────────────────────────────────

describe("createDeliveryNoteSchema", () => {
  const validLine = { description: "Item", quantity: 3 };
  const valid = {
    client_id: "c1",
    issue_date: "2024-06-01",
    lines: [validLine],
  };

  it("accepts valid delivery note", () => expectValid(createDeliveryNoteSchema, valid));
  it("rejects empty lines", () => expectInvalid(createDeliveryNoteSchema, { ...valid, lines: [] }));
});

// ─── Payment Schema ───────────────────────────────────────────────────────

describe("paymentSchema", () => {
  const valid = {
    invoice_id: "inv-1",
    amount: 100,
    payment_date: "2024-01-15",
    payment_method: "CASH",
  };

  it("accepts valid payment", () => expectValid(paymentSchema, valid));
  it("rejects zero amount", () => expectInvalid(paymentSchema, { ...valid, amount: 0 }));
  it("rejects negative amount", () => expectInvalid(paymentSchema, { ...valid, amount: -5 }));
  it("rejects missing payment_method", () =>
    expectInvalid(paymentSchema, { ...valid, payment_method: "" }));
});

// ─── Purchase Order Schema ────────────────────────────────────────────────

describe("purchaseOrderSchema", () => {
  const validLine = { product_id: "p1", quantity: 10, unit_price: 5 };
  const valid = { supplier_id: "s1", lines: [validLine] };

  it("accepts valid purchase order", () => expectValid(purchaseOrderSchema, valid));
  it("rejects empty lines", () => expectInvalid(purchaseOrderSchema, { ...valid, lines: [] }));
  it("rejects line with zero quantity", () =>
    expectInvalid(purchaseOrderSchema, {
      ...valid,
      lines: [{ ...validLine, quantity: 0 }],
    }));
});

describe("supplierPaymentSchema", () => {
  const valid = { amount: 100, payment_date: "2024-01-15" };

  it("accepts valid supplier payment", () => expectValid(supplierPaymentSchema, valid));
  it("rejects zero amount", () => expectInvalid(supplierPaymentSchema, { ...valid, amount: 0 }));
});

// ─── POS Schemas ──────────────────────────────────────────────────────────

describe("posTransactionSchema", () => {
  const validLine = { designation: "Coffee", quantity: 1, unit_price: 3 };
  const validPayment = { payment_method: "CASH", amount: 3 };
  const valid = {
    register_id: "r1",
    session_id: "s1",
    lines: [validLine],
    payments: [validPayment],
  };

  it("accepts valid transaction", () => expectValid(posTransactionSchema, valid));
  it("rejects empty lines", () => expectInvalid(posTransactionSchema, { ...valid, lines: [] }));
  it("rejects empty payments", () => expectInvalid(posTransactionSchema, { ...valid, payments: [] }));
  it("rejects invalid payment method", () =>
    expectInvalid(posTransactionSchema, {
      ...valid,
      payments: [{ payment_method: "BITCOIN", amount: 3 }],
    }));
  it("accepts CARD payment", () =>
    expectValid(posTransactionSchema, {
      ...valid,
      payments: [{ payment_method: "CARD", amount: 3 }],
    }));
});

describe("posSessionCloseSchema", () => {
  it("accepts valid close", () =>
    expectValid(posSessionCloseSchema, { session_id: "s1", actual_cash: 500 }));
  it("rejects missing session_id", () =>
    expectInvalid(posSessionCloseSchema, { session_id: "" }));
});

describe("posCashMovementSchema", () => {
  const valid = { session_id: "s1", movement_type: "IN", amount: 50, reason: "Change" };

  it("accepts valid cash movement", () => expectValid(posCashMovementSchema, valid));
  it("rejects invalid movement_type", () =>
    expectInvalid(posCashMovementSchema, { ...valid, movement_type: "TRANSFER" }));
  it("rejects zero amount", () =>
    expectInvalid(posCashMovementSchema, { ...valid, amount: 0 }));
});

describe("posRegisterSchema", () => {
  it("accepts valid register", () => expectValid(posRegisterSchema, { name: "Caisse 1" }));
  it("rejects empty name", () => expectInvalid(posRegisterSchema, { name: "" }));
});

describe("posPrinterSchema", () => {
  const valid = {
    printer_name: "Receipt Printer",
    connection_type: "USB",
    connection_address: "/dev/usb/lp0",
  };

  it("accepts valid printer", () => expectValid(posPrinterSchema, valid));
  it("rejects missing printer_name", () =>
    expectInvalid(posPrinterSchema, { ...valid, printer_name: "" }));
});

// ─── Settings Schema ──────────────────────────────────────────────────────

describe("settingsSchema", () => {
  it("accepts partial settings", () =>
    expectValid(settingsSchema, { company_name: "Acme" }));

  it("accepts empty object (all optional)", () =>
    expectValid(settingsSchema, {}));

  it("rejects tax_rate > 100", () =>
    expectInvalid(settingsSchema, { default_tax_rate: 150 }));

  it("rejects negative payment terms", () =>
    expectInvalid(settingsSchema, { default_payment_terms: -1 }));

  it("rejects next_invoice_number < 1", () =>
    expectInvalid(settingsSchema, { next_invoice_number: 0 }));

  it("coerces string numbers", () => {
    const result = settingsSchema.safeParse({ default_tax_rate: "19" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.default_tax_rate).toBe(19);
  });
});

// ─── Batch Delete Schema ──────────────────────────────────────────────────

describe("batchDeleteSchema", () => {
  it("accepts array of IDs", () => expectValid(batchDeleteSchema, ["id1", "id2"]));
  it("rejects empty array", () => expectInvalid(batchDeleteSchema, []));
  it("rejects array with empty strings", () => expectInvalid(batchDeleteSchema, [""]));
});

// ─── Subscription Schemas ─────────────────────────────────────────────────

describe("subscriptionRequestSchema", () => {
  const valid = {
    plan_id: "plan-1",
    billing_cycle: "monthly",
    request_type: "new",
  };

  it("accepts valid request", () => expectValid(subscriptionRequestSchema, valid));
  it("rejects invalid request_type", () =>
    expectInvalid(subscriptionRequestSchema, { ...valid, request_type: "cancel" }));
  it("accepts all valid request types", () => {
    for (const t of ["new", "upgrade", "downgrade", "renewal"]) {
      expectValid(subscriptionRequestSchema, { ...valid, request_type: t });
    }
  });
});

describe("validateCouponSchema", () => {
  it("accepts valid data", () =>
    expectValid(validateCouponSchema, { code: "SAVE20", plan_id: "plan-1" }));
  it("rejects empty code", () =>
    expectInvalid(validateCouponSchema, { code: "", plan_id: "plan-1" }));
});

// ─── Reminder Schema ──────────────────────────────────────────────────────

describe("reminderSchema", () => {
  const valid = {
    reminder_type: "payment",
    document_type: "invoice",
    document_id: "inv-1",
    scheduled_date: "2024-06-15",
  };

  it("accepts valid reminder", () => expectValid(reminderSchema, valid));
  it("rejects missing document_id", () =>
    expectInvalid(reminderSchema, { ...valid, document_id: "" }));
});

// ─── Product Supplier Schema ──────────────────────────────────────────────

describe("productSupplierSchema", () => {
  it("accepts valid product-supplier link", () =>
    expectValid(productSupplierSchema, { product_id: "p1", supplier_id: "s1", purchase_price: 10 }));
  it("rejects negative purchase_price", () =>
    expectInvalid(productSupplierSchema, { product_id: "p1", supplier_id: "s1", purchase_price: -5 }));
});

// ─── Invoice from Delivery Notes ──────────────────────────────────────────

describe("invoiceFromDeliveryNotesSchema", () => {
  it("accepts valid delivery note IDs", () =>
    expectValid(invoiceFromDeliveryNotesSchema, { delivery_note_ids: ["dn-1", "dn-2"] }));
  it("rejects empty array", () =>
    expectInvalid(invoiceFromDeliveryNotesSchema, { delivery_note_ids: [] }));
});
