import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions-server";
import { uploadImage, deleteStoredImage, sameStoredObject, InvalidUploadError } from "@/lib/storage";

export const GET = withAuth(async (req, { tenantId }) => {
  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  if (!settings?.logoPath) {
    return NextResponse.json(null);
  }
  return NextResponse.json(settings.logoPath);
});

// The logo prints on every document, so changing it is a settings right,
// exactly like the rest of the company settings.
export const POST = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "settings", "edit");
  if (denied) return denied;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  if (!settings) {
    return NextResponse.json({ error: "Company settings not found" }, { status: 404 });
  }

  let publicUrl: string;
  try {
    publicUrl = await uploadImage(tenantId, "logos", "logo", new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof InvalidUploadError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  await prisma.companySettings.update({
    where: { id: settings.id },
    data: { logoPath: publicUrl },
  });

  // A logo.png replaced by a logo.jpg leaves the old object behind otherwise.
  if (settings.logoPath && !sameStoredObject(settings.logoPath, publicUrl)) {
    await deleteStoredImage(settings.logoPath).catch(() => { /* orphan, not an error */ });
  }

  return NextResponse.json(publicUrl);
});

export const DELETE = withAuth(async (req, { tenantId, session }) => {
  const denied = await requirePermission(session, "settings", "edit");
  if (denied) return denied;

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  if (!settings) {
    return NextResponse.json({ error: "Company settings not found" }, { status: 404 });
  }

  await deleteStoredImage(settings.logoPath);

  await prisma.companySettings.update({
    where: { id: settings.id },
    data: { logoPath: null },
  });
  return new NextResponse(null, { status: 204 });
});
