import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { uploadFile, deleteFile } from "@/lib/storage";

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

export const POST = withAuth(async (req, { tenantId, params }) => {
  const productId = params?.id;
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const ext = file.name.split(".").pop() || "png";
  const filename = `${productId}.${ext}`;

  const publicUrl = await uploadFile(
    tenantId,
    "product-photos",
    filename,
    Buffer.from(bytes),
    file.type || "image/png",
  );

  await prisma.product.update({
    where: { tenantId, id: productId },
    data: { photoPath: publicUrl },
  });

  return NextResponse.json(publicUrl);
});

export const DELETE = withAuth(async (req, { tenantId, params }) => {
  const productId = params?.id;
  const product = await prisma.product.findFirst({
    where: { tenantId, id: productId },
    select: { photoPath: true },
  });

  if (product?.photoPath) {
    // Extract filename from URL or use product ID
    const ext = product.photoPath.split(".").pop()?.split("?")[0] || "png";
    await deleteFile(tenantId, "product-photos", `${productId}.${ext}`);
  }

  await prisma.product.update({
    where: { tenantId, id: productId },
    data: { photoPath: null },
  });
  return new NextResponse(null, { status: 204 });
});
