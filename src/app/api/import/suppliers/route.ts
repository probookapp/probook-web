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

      const name = row.name || row.nom || row.fournisseur;
      if (!name) {
        skipped++;
        continue;
      }

      await prisma.supplier.create({
        data: {
          tenantId,
          name,
          email: row.email || null,
          phone: row.phone || row.telephone || null,
          address: row.address || row.adresse || null,
          notes: row.notes || null,
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
