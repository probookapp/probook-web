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

      const name = row.name || row.nom || row.client;
      if (!name) {
        skipped++;
        continue;
      }

      await prisma.client.create({
        data: {
          tenantId,
          name,
          email: row.email || null,
          phone: row.phone || row.telephone || null,
          address: row.address || row.adresse || null,
          city: row.city || row.ville || null,
          postalCode: row.postal_code || row.code_postal || null,
          country: row.country || row.pays || null,
          siret: row.siret || null,
          vatNumber: row.vat_number || row.tva || null,
          notes: row.notes || null,
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
