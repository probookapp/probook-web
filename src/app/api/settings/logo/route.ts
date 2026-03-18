import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { uploadFile, deleteFile } from "@/lib/storage";

export const GET = withAuth(async (req, { tenantId }) => {
  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  if (!settings?.logoPath) {
    return NextResponse.json(null);
  }
  return NextResponse.json(settings.logoPath);
});

export const POST = withAuth(async (req, { tenantId }) => {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  if (!settings) {
    return NextResponse.json({ error: "Company settings not found" }, { status: 404 });
  }

  const bytes = await file.arrayBuffer();
  const ext = file.name.split(".").pop() || "png";
  const filename = `logo.${ext}`;

  const publicUrl = await uploadFile(
    tenantId,
    "logos",
    filename,
    Buffer.from(bytes),
    file.type || "image/png",
  );

  await prisma.companySettings.update({
    where: { id: settings.id },
    data: { logoPath: publicUrl },
  });

  return NextResponse.json(publicUrl);
});

export const DELETE = withAuth(async (req, { tenantId }) => {
  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  if (!settings) {
    return NextResponse.json({ error: "Company settings not found" }, { status: 404 });
  }

  if (settings.logoPath) {
    const ext = settings.logoPath.split(".").pop()?.split("?")[0] || "png";
    await deleteFile(tenantId, "logos", `logo.${ext}`);
  }

  await prisma.companySettings.update({
    where: { id: settings.id },
    data: { logoPath: null },
  });
  return new NextResponse(null, { status: 204 });
});
