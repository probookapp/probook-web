import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const POST = withAuth(async (req, { tenantId }) => {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const text = await file.text();
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 });
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    try {
      const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || "";
      });

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
      errors.push(`Row ${i + 1}: ${e instanceof Error ? e.message : "Unknown error"}`);
      skipped++;
    }
  }

  return NextResponse.json({ imported, skipped, errors });
});
