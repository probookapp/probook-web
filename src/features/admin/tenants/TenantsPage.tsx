"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useLocale } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { Search, Eye, Pause, Play, Trash2, Pencil, LogIn, Download } from "lucide-react";
import { exportToCsv } from "@/lib/csv-export";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Modal,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Input,
  Badge,
  Select,
} from "@/components/ui";
import { LoadMoreSentinel } from "@/components/shared/LoadMoreSentinel";
import {
  useAdminTenantsInfinite,
  useSuspendTenant,
  useActivateTenant,
  useDeleteTenant,
  useUpdateTenant,
  useImpersonateTenant,
} from "./hooks/useTenants";

type Tenant = Record<string, unknown>;

function getStatusVariant(status: string): "success" | "warning" | "danger" | "default" {
  switch (status) {
    case "active":
      return "success";
    case "pending":
      return "warning";
    case "expired":
    case "suspended":
      return "danger";
    default:
      return "default";
  }
}

export function TenantsPage() {
  const { t } = useTranslation("admin");
  const router = useRouter();
  const locale = useLocale();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [editForm, setEditForm] = useState({ name: "", slug: "" });
  const [impersonateTarget, setImpersonateTarget] = useState<Tenant | null>(null);

  // Debounce the search box before hitting the server-side `search` filter.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Status + search are forwarded to the route's server-side filters.
  const {
    data: tenantPages,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useAdminTenantsInfinite({
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
  });
  const tenants = useMemo(
    () => tenantPages?.pages.flatMap((page) => page.data),
    [tenantPages]
  );
  const suspendTenant = useSuspendTenant();
  const activateTenant = useActivateTenant();
  const deleteTenant = useDeleteTenant();
  const updateTenant = useUpdateTenant();
  const impersonateTenant = useImpersonateTenant();

  const handleDelete = async (id: string) => {
    await deleteTenant.mutateAsync(id);
    setDeleteConfirmId(null);
  };

  const handleOpenEdit = (tenant: Tenant) => {
    setEditTenant(tenant);
    setEditForm({ name: String(tenant.name || ""), slug: String(tenant.slug || "") });
  };

  const handleSaveEdit = async () => {
    if (!editTenant) return;
    await updateTenant.mutateAsync({
      id: editTenant.id,
      name: editForm.name,
      slug: editForm.slug,
    });
    setEditTenant(null);
  };

  const handleImpersonate = async () => {
    if (!impersonateTarget) return;
    await impersonateTenant.mutateAsync(String(impersonateTarget.id));
    setImpersonateTarget(null);
    // Full navigation so the impersonation cookie is picked up by the tenant app
    window.location.href = `/${locale}/dashboard`;
  };

  const handleToggleStatus = async (tenant: Tenant) => {
    const id = String(tenant.id);
    if (tenant.status === "suspended") {
      await activateTenant.mutateAsync(id);
    } else {
      await suspendTenant.mutateAsync(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const tenantList = (tenants || []) as Tenant[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t("tenants.title")}</h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{t("tenants.subtitle")}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={tenantList.length === 0}
          onClick={() =>
            exportToCsv(
              tenantList,
              [
                { header: t("tenants.name"), accessor: (r) => String(r.name ?? "") },
                { header: t("tenants.slug"), accessor: (r) => String(r.slug ?? "") },
                { header: t("tenants.status"), accessor: (r) => String(r.status ?? "") },
                { header: t("tenants.plan"), accessor: (r) => String(r.plan_name ?? r.plan ?? "") },
                { header: t("tenants.users"), accessor: (r) => String(r.user_count ?? r.users_count ?? "") },
                { header: t("tenants.created"), accessor: (r) => (r.created_at ? new Date(String(r.created_at)).toISOString().slice(0, 10) : "") },
              ],
              "tenants"
            )
          }
        >
          <Download className="h-4 w-4 mr-2" />
          {t("tenants.exportCsv")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t("tenants.list")}</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                name="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-40"
                options={[
                  { value: "", label: t("tenants.allStatuses") },
                  { value: "active", label: t("tenants.active") },
                  { value: "pending", label: t("tenants.pending") },
                  { value: "suspended", label: t("tenants.suspended") },
                  { value: "expired", label: t("tenants.expired") },
                ]}
              />
              <div className="relative w-full sm:w-56 md:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  name="tenant-search"
                  placeholder={t("tenants.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {tenantList.length > 0 ? (
              tenantList.map((tenant) => (
                <div
                  key={String(tenant.id)}
                  className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => router.push(`/admin/tenants/${tenant.id}`)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {String(tenant.name || "-")}
                    </span>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => router.push(`/admin/tenants/${tenant.id}`)}
                        className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        title={t("tenants.view")}
                        aria-label={t("tenants.view")}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(tenant)}
                        className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        title={tenant.status === "suspended" ? t("tenants.activate") : t("tenants.suspend")}
                        aria-label={tenant.status === "suspended" ? t("tenants.activate") : t("tenants.suspend")}
                      >
                        {tenant.status === "suspended" ? (
                          <Play className="h-4 w-4" />
                        ) : (
                          <Pause className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => setImpersonateTarget(tenant)}
                        className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        title={t("tenants.impersonate")}
                        aria-label={t("tenants.impersonate")}
                      >
                        <LogIn className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(tenant)}
                        className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                        title={t("tenants.edit")}
                        aria-label={t("tenants.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(String(tenant.id))}
                        className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                        title={t("tenants.delete")}
                        aria-label={t("tenants.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={getStatusVariant(String(tenant.status || ""))}>
                      {String(tenant.status || "-")}
                    </Badge>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {String(tenant.plan_name || tenant.plan || "-")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                    <span>{String(tenant.user_count ?? tenant.users_count ?? "-")} {t("tenants.users")}</span>
                    <span>
                      {tenant.last_active_at
                        ? new Date(String(tenant.last_active_at)).toLocaleDateString()
                        : "-"}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                {t("tenants.noTenants")}
              </div>
            )}
          </div>
          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <Table className="min-w-225">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tenants.name")}</TableHead>
                  <TableHead>{t("tenants.slug")}</TableHead>
                  <TableHead>{t("tenants.status")}</TableHead>
                  <TableHead>{t("tenants.plan")}</TableHead>
                  <TableHead>{t("tenants.users")}</TableHead>
                  <TableHead>{t("tenants.lastActive")}</TableHead>
                  <TableHead>{t("tenants.created")}</TableHead>
                  <TableHead className="w-32">{t("tenants.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantList.length > 0 ? (
                  tenantList.map((tenant) => (
                    <TableRow
                      key={String(tenant.id)}
                      className="cursor-pointer"
                      onClick={() => router.push(`/admin/tenants/${tenant.id}`)}
                    >
                      <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                        {String(tenant.name || "-")}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {String(tenant.slug || "-")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(String(tenant.status || ""))}>
                          {String(tenant.status || "-")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {String(tenant.plan_name || tenant.plan || "-")}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {String(tenant.user_count ?? tenant.users_count ?? "-")}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {tenant.last_active_at
                          ? new Date(String(tenant.last_active_at)).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {tenant.created_at
                          ? new Date(String(tenant.created_at)).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => router.push(`/admin/tenants/${tenant.id}`)}
                            className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                            title={t("tenants.view")}
                            aria-label={t("tenants.view")}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(tenant)}
                            className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                            title={tenant.status === "suspended" ? t("tenants.activate") : t("tenants.suspend")}
                            aria-label={tenant.status === "suspended" ? t("tenants.activate") : t("tenants.suspend")}
                          >
                            {tenant.status === "suspended" ? (
                              <Play className="h-4 w-4" />
                            ) : (
                              <Pause className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(String(tenant.id))}
                            className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                            title={t("tenants.delete")}
                            aria-label={t("tenants.delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("tenants.noTenants")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <LoadMoreSentinel
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            loadedCount={tenantList.length}
          />
        </CardContent>
      </Card>

      {/* Edit tenant Modal */}
      <Modal
        isOpen={!!editTenant}
        onClose={() => setEditTenant(null)}
        title={t("tenants.editTenant")}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            name="edit-tenant-name"
            label={t("tenants.name")}
            value={editForm.name}
            onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            name="edit-tenant-slug"
            label={t("tenants.slug")}
            value={editForm.slug}
            onChange={(e) => setEditForm((p) => ({ ...p, slug: e.target.value }))}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditTenant(null)}>
              {t("tenants.cancel")}
            </Button>
            <Button onClick={handleSaveEdit} isLoading={updateTenant.isPending}>
              {t("tenants.save")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Impersonate confirmation Modal */}
      <Modal
        isOpen={!!impersonateTarget}
        onClose={() => setImpersonateTarget(null)}
        title={t("tenants.impersonate")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("tenants.impersonateConfirm", { name: String(impersonateTarget?.name || "") })}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setImpersonateTarget(null)}>
            {t("tenants.cancel")}
          </Button>
          <Button onClick={handleImpersonate} isLoading={impersonateTenant.isPending}>
            {t("tenants.impersonate")}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={t("tenants.confirmDeleteTitle")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("tenants.confirmDeleteMessage")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
            {t("tenants.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            isLoading={deleteTenant.isPending}
          >
            {t("tenants.delete")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
