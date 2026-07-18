import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { parseImportFile, ImportFileError } from "@/lib/parse-import-file";
import { requirePermission } from "@/lib/permissions-server";

export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "clients", "create");
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
  const data: Prisma.ClientCreateManyInput[] = [];

  rows.forEach((row, i) => {
    const name = (row.name || row.nom || row.client || "").trim();
    if (!name) {
      skipped++;
      return;
    }
    if (name.length > 500) {
      errors.push(`Row ${i + 2}: name is too long (max 500 characters)`);
      skipped++;
      return;
    }

    data.push({
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
    });
  });

  let imported = 0;
  if (data.length > 0) {
    try {
      // Single atomic insert: either every valid row imports or none do.
      const result = await prisma.client.createMany({ data });
      imported = result.count;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json({ error: `Import failed: ${message}` }, { status: 500 });
    }
  }

  // `added` mirrors `imported` for the ImportDialog UI, which reads `result.added`.
  return NextResponse.json({ imported, added: imported, updated: 0, skipped, errors });
});
