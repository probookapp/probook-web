-- Action-level (CRUD) permission flags. Backfill from the existing `granted`
-- flag so current employees keep the exact access they have today.
ALTER TABLE "user_permissions" ADD COLUMN "can_view" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_permissions" ADD COLUMN "can_create" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_permissions" ADD COLUMN "can_edit" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_permissions" ADD COLUMN "can_delete" BOOLEAN NOT NULL DEFAULT true;
UPDATE "user_permissions"
  SET "can_view" = "granted",
      "can_create" = "granted",
      "can_edit" = "granted",
      "can_delete" = "granted";

-- Credit note numbering settings
ALTER TABLE "company_settings" ADD COLUMN "credit_note_prefix" TEXT DEFAULT 'CN-';
ALTER TABLE "company_settings" ADD COLUMN "next_credit_note_number" INTEGER DEFAULT 1;

-- Platform admin 2FA
ALTER TABLE "platform_admins" ADD COLUMN "totp_secret" TEXT;
ALTER TABLE "platform_admins" ADD COLUMN "totp_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Partial goods receipt: track received qty per purchase-order line
ALTER TABLE "purchase_order_lines" ADD COLUMN "received_quantity" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "type" TEXT NOT NULL,
    "quantity_change" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reason" TEXT,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "credit_note_number" TEXT NOT NULL,
    "invoice_id" TEXT,
    "client_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issue_date" DATE NOT NULL,
    "reason" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_lines" (
    "id" TEXT NOT NULL,
    "credit_note_id" TEXT NOT NULL,
    "product_id" TEXT,
    "variant_id" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_login_attempts" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "ip_address" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_product_id_created_at_idx" ON "stock_movements"("tenant_id", "product_id", "created_at");
CREATE INDEX "stock_movements_tenant_id_created_at_idx" ON "stock_movements"("tenant_id", "created_at");
CREATE INDEX "credit_notes_tenant_id_idx" ON "credit_notes"("tenant_id");
CREATE INDEX "credit_notes_client_id_idx" ON "credit_notes"("client_id");
CREATE INDEX "credit_notes_invoice_id_idx" ON "credit_notes"("invoice_id");
CREATE UNIQUE INDEX "credit_notes_tenant_id_credit_note_number_key" ON "credit_notes"("tenant_id", "credit_note_number");
CREATE INDEX "credit_note_lines_credit_note_id_idx" ON "credit_note_lines"("credit_note_id");
CREATE INDEX "admin_login_attempts_ip_address_created_at_idx" ON "admin_login_attempts"("ip_address", "created_at");
CREATE INDEX "admin_login_attempts_username_created_at_idx" ON "admin_login_attempts"("username", "created_at");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
