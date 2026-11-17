import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { uploadImage, deleteStoredImage, sameStoredObject, InvalidUploadError } from "@/lib/storage";
import { requirePermission } from "@/lib/permissions-server";

export const GET = withAuth(async (req, { tenantId, params }) => {
  const product = await prisma.product.findFirst({
    where: { tenantId, id: params?.id },
    select: { photoPath: true },
  });
  if (!product?.photoPath) {
    return NextResponse.json(null);
  }
  return NextResponse.json(product.photoPath);
});

export const POST = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "products", "edit");
  if (denied) return denied;

  // Resolve the product before storing anything: the id names the object, so
  // an unknown or foreign id must never reach the bucket.
  const product = await prisma.product.findFirst({
    where: { tenantId, id: params?.id },
    select: { id: true, photoPath: true },
  });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  let publicUrl: string;
  try {
    publicUrl = await uploadImage(tenantId, "product-photos", product.id, new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof InvalidUploadError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  await prisma.product.update({
    where: { tenantId, id: product.id },
    data: { photoPath: publicUrl },
  });

  if (product.photoPath && !sameStoredObject(product.photoPath, publicUrl)) {
    await deleteStoredImage(product.photoPath).catch(() => { /* orphan, not an error */ });
  }

  return NextResponse.json(publicUrl);
});

export const DELETE = withAuth(async (req, { tenantId, params, session }) => {
  const denied = await requirePermission(session, "products", "edit");
  if (denied) return denied;

  const product = await prisma.product.findFirst({
    where: { tenantId, id: params?.id },
    select: { id: true, photoPath: true },
  });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  await deleteStoredImage(product.photoPath);

  await prisma.product.update({
    where: { tenantId, id: product.id },
    data: { photoPath: null },
  });
  return new NextResponse(null, { status: 204 });
});
