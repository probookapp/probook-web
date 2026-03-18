import { useQuery } from "@tanstack/react-query";
import { adminAuditLogsApi } from "@/lib/admin-api";

interface AuditLogsFilters {
  action?: string;
  tenantId?: string;
  page?: number;
  limit?: number;
}

export function useAdminAuditLogs(filters?: AuditLogsFilters) {
  return useQuery({
    queryKey: ["admin-audit-logs", filters],
    queryFn: () =>
      adminAuditLogsApi.getAll({
        page: filters?.page,
        limit: filters?.limit,
        action: filters?.action,
        tenantId: filters?.tenantId,
      }),
  });
}
