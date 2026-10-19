-- Supplier account: an opening balance per supplier, hand-written adjustments,
-- and returns of goods kept by the supplier as credit (avoirs fournisseur).
-- Also flags the payments taken from a till when goods are received.

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "opening_balance" DECIMAL(16,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "supplier_payments" ADD COLUMN     "from_register" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "supplier_adjustments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "amount" DECIMAL(16,3) NOT NULL,
    "adjustment_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_returns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "purchase_order_id" TEXT,
    "location_id" TEXT,
    "return_date" DATE NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "total" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_return_lines" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "purchase_order_line_id" TEXT,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit_price" DECIMAL(16,3) NOT NULL,
    "tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "total" DECIMAL(16,3) NOT NULL DEFAULT 0,

    CONSTRAINT "supplier_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_adjustments_tenant_id_idx" ON "supplier_adjustments"("tenant_id");

-- CreateIndex
CREATE INDEX "supplier_adjustments_supplier_id_idx" ON "supplier_adjustments"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_returns_tenant_id_idx" ON "supplier_returns"("tenant_id");

-- CreateIndex
CREATE INDEX "supplier_returns_supplier_id_idx" ON "supplier_returns"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_returns_purchase_order_id_idx" ON "supplier_returns"("purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_returns_tenant_id_return_number_key" ON "supplier_returns"("tenant_id", "return_number");

-- CreateIndex
CREATE INDEX "supplier_return_lines_return_id_idx" ON "supplier_return_lines"("return_id");

-- CreateIndex
CREATE INDEX "supplier_return_lines_purchase_order_line_id_idx" ON "supplier_return_lines"("purchase_order_line_id");

-- AddForeignKey
ALTER TABLE "supplier_adjustments" ADD CONSTRAINT "supplier_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_adjustments" ADD CONSTRAINT "supplier_adjustments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "supplier_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Receipts paid from a till used to take the cash out of the register without
-- recording a supplier payment, so the supplier's balance still showed the
-- money as owed. Rebuild one payment per till movement from those movements,
-- which carry the order number in their reason.
INSERT INTO "supplier_payments" ("id", "tenant_id", "supplier_id", "purchase_order_id", "amount", "payment_date", "payment_method", "from_register", "created_at")
SELECT gen_random_uuid(), po."tenant_id", po."supplier_id", po."id", m."amount", m."created_at"::date, 'CASH', true, m."created_at"
FROM "purchase_orders" po
JOIN "pos_cash_movements" m
  ON m."tenant_id" = po."tenant_id"
 AND m."movement_type" = 'OUT'
 AND m."reason" = 'Purchase Order ' || po."order_number"
WHERE po."paid_from_register" = true
  AND NOT EXISTS (
    SELECT 1 FROM "supplier_payments" sp
    WHERE sp."purchase_order_id" = po."id" AND sp."from_register" = true
  );
