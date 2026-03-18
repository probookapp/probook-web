"use client";

import { use } from "react";
import { TenantDetailPage } from "@/features/admin/tenants";

export default function AdminTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <TenantDetailPage tenantId={id} />;
}
