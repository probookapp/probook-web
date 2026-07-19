import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { parseImportFile, ImportFileError } from "@/lib/parse-import-file";
import { requirePermission } from "@/lib/permissions-server";
import { recordInitialStock, getDefaultLocationId } from "@/lib/stock";

interface ValidProductRow {
  designation: string;
  description: string | null;
  unitPrice: number;
  taxRate: number;
  unit: string;
  reference: string | null;
  barcode: string | null;
  isService: boolean;
  quantity: number;
  purchasePrice: number;
}

/**
 * Parses a numeric cell. Empty cells fall back to `fallback`; accepts a comma
 * decimal separator (French exports). Returns null for non-numeric input so
 * NaN never reaches the database.
 */
function parseNumeric(raw: string | undefined, fallback: number): number | null {
  const s = (raw || "").trim();
  if (!s) return fallback;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "products", "create");
  if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  let rows: Record<string, string>[];
  try {
    ({ rows } = await parseImportFile(file));
  } catch (e: unknown) {
    if (e instanceof ImportFileError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 });
  }

  let skipped = 0;
  const errors: string[] = [];
  const valid: ValidProductRow[] = [];

  rows.forEach((row, i) => {
    const designation = (row.designation || row.name || row.produit || "").trim();
    if (!designation) {
      skipped++;
      return;
    }
    if (designation.length > 500) {
      errors.push(`Row ${i + 2}: designation is too long (max 500 characters)`);
      skipped++;
      return;
    }

    const unitPrice = parseNumeric(row.unit_price || row.prix_ht, 0);
    const taxRate = parseNumeric(row.tax_rate || row.tva, 20);
    const quantity = parseNumeric(row.quantity || row.quantite, 0);
    const purchasePrice = parseNumeric(row.purchase_price || row.prix_achat, 0);
    if (unitPrice === null || taxRate === null || quantity === null || purchasePrice === null) {
      errors.push(`Row ${i + 2}: invalid numeric value`);
      skipped++;
      return;
    }

    valid.push({
      designation,
      description: row.description || null,
      unitPrice,
      taxRate,
      unit: row.unit || row.unite || "unit",
      reference: row.reference || null,
      barcode: row.barcode || row.code_barre || null,
      isService: row.is_service === "true" || row.service === "true",
      quantity,
      purchasePrice,
    });
  });

  let imported = 0;
  if (valid.length > 0) {
    try {
      // Resolve the default location up-front (creates "Main" if absent) so
      // the per-row stock seeding inside the transaction doesn't re-query it.
      const needsStock = valid.some((r) => !r.isService && r.quantity > 0);
      const locationId = needsStock ? await getDefaultLocationId(prisma, tenantId) : null;

      // One transaction: either every valid row imports or none do.
      await prisma.$transaction(
        async (tx) => {
          for (const r of valid) {
            const created = await tx.product.create({
              data: {
                tenantId,
                designation: r.designation,
                description: r.description,
                unitPrice: r.unitPrice,
                taxRate: r.taxRate,
                unit: r.unit,
                reference: r.reference,
                barcode: r.barcode,
                isService: r.isService,
                purchasePrice: r.purchasePrice,
              },
            });

            // Seed a per-location stock level so imported products are consistent
            // with the multi-location stock engine (skips services / zero qty).
            if (!r.isService && r.quantity > 0 && locationId) {
              await recordInitialStock(tx, {
                tenantId,
                productId: created.id,
                quantity: r.quantity,
                locationId,
                referenceType: "import",
              });
            }
          }
        },
        { timeout: 120_000, maxWait: 10_000 }
      );
      imported = valid.length;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json({ error: `Import failed: ${message}` }, { status: 500 });
    }
  }

  // `added` mirrors `imported` for the ImportDialog UI, which reads `result.added`.
  return NextResponse.json({ imported, added: imported, updated: 0, skipped, errors });
});
