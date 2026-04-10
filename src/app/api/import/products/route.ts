import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { parseImportFile } from "@/lib/parse-import-file";

export const POST = withAuth(async (req, { tenantId }) => {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const { rows } = await parseImportFile(file);
  if (rows.length === 0) {
    return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];

      const designation = row.designation || row.name || row.produit;
      if (!designation) {
        skipped++;
        continue;
      }

      await prisma.product.create({
        data: {
          tenantId,
          designation,
          description: row.description || null,
          unitPrice: parseFloat(row.unit_price || row.prix_ht || "0"),
          taxRate: parseFloat(row.tax_rate || row.tva || "20"),
          unit: row.unit || row.unite || "unit",
          reference: row.reference || null,
          barcode: row.barcode || row.code_barre || null,
          isService: row.is_service === "true" || row.service === "true",
          quantity: parseFloat(row.quantity || row.quantite || "0"),
          purchasePrice: parseFloat(row.purchase_price || row.prix_achat || "0"),
        },
      });
      imported++;
    } catch (e: unknown) {
      errors.push(`Row ${i + 2}: ${e instanceof Error ? e.message : "Unknown error"}`);
      skipped++;
    }
  }

  return NextResponse.json({ imported, skipped, errors });
});
