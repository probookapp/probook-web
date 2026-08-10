import { useQuery } from "@tanstack/react-query";
import { adminAuditLogsApi } from "@/lib/admin-api";

import { keepPreviousData } from "@tanstack/react-query";

interface AuditLogsFilters {
  action?: string;
  tenantId?: string;
  from?: string;
  to?: string;
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
        from: filters?.from,
        to: filters?.to,
      }),
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}
