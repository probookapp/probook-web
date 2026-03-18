import { NextRequest, NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/admin-api-utils";
import { prisma } from "@/lib/db";
import { toSnakeCase } from "@/lib/api-utils";

export const GET = withPlatformAdmin(async (_req: NextRequest, ctx) => {
  const id = ctx.params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const dataRequest = await prisma.dataRequest.findUnique({
    where: { id },
    include: {
      tenant: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  if (!dataRequest) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(toSnakeCase(dataRequest));
});
