-- Packs: a product sold as one line, made of other products.
--
-- A camera installer sells "the camera, its connectors, the junction box and
-- the fitting" as one priced offer. The pack holds no stock of its own: what
-- leaves the shelves are its components, so they are listed here and every
-- document that sells a pack carries them as real lines.
--
-- RESTRICT on the component side: deleting a product that a pack is made of
-- would silently change what the pack is. CASCADE on the pack side: the
-- composition means nothing once the pack itself is gone.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_bundle" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "bundle_components" (
    "id"                TEXT NOT NULL,
    "tenant_id"         TEXT NOT NULL,
    "bundle_id"         TEXT NOT NULL,
    "bundle_variant_id" TEXT,
    "product_id"        TEXT NOT NULL,
    "variant_id"        TEXT,
    "quantity"          DOUBLE PRECISION NOT NULL,
    "position"          INTEGER NOT NULL DEFAULT 0,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bundle_components_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bundle_components_tenant_id_idx" ON "bundle_components"("tenant_id");
CREATE INDEX "bundle_components_bundle_id_idx" ON "bundle_components"("bundle_id");
CREATE INDEX "bundle_components_product_id_idx" ON "bundle_components"("product_id");

ALTER TABLE "bundle_components"
    ADD CONSTRAINT "bundle_components_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bundle_components"
    ADD CONSTRAINT "bundle_components_bundle_id_fkey" FOREIGN KEY ("bundle_id")
    REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bundle_components"
    ADD CONSTRAINT "bundle_components_bundle_variant_id_fkey" FOREIGN KEY ("bundle_variant_id")
    REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bundle_components"
    ADD CONSTRAINT "bundle_components_product_id_fkey" FOREIGN KEY ("product_id")
    REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bundle_components"
    ADD CONSTRAINT "bundle_components_variant_id_fkey" FOREIGN KEY ("variant_id")
    REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A pack on a document is a header line plus one line per component, tied by
-- bundle_key. The header is presentation: it is excluded from every total, the
-- components carry the value, each at its own VAT rate, and draw on the stock.
ALTER TABLE "quote_lines" ADD COLUMN IF NOT EXISTS "is_bundle_header" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quote_lines" ADD COLUMN IF NOT EXISTS "bundle_key" TEXT;
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "is_bundle_header" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "bundle_key" TEXT;
ALTER TABLE "delivery_note_lines" ADD COLUMN IF NOT EXISTS "is_bundle_header" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "delivery_note_lines" ADD COLUMN IF NOT EXISTS "bundle_key" TEXT;
ALTER TABLE "pos_transaction_lines" ADD COLUMN IF NOT EXISTS "is_bundle_header" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pos_transaction_lines" ADD COLUMN IF NOT EXISTS "bundle_key" TEXT;
