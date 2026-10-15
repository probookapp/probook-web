"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Download, Check, X, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Modal,
  Input,
  Badge,
  Select,
  Textarea,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  PageHeader,
  RowActions,
  type RowAction,
  ColumnPicker,
} from "@/components/ui";
import { useTableColumns } from "@/hooks/useTableColumns";
import { useAdminDataRequests, useCreateDataRequest, useUpdateDataRequest, useExecuteDataRequest } from "./hooks/useDataRequests";
import { useAdminTenants } from "@/features/admin/tenants/hooks/useTenants";
import { useSuperAdminOnly } from "@/features/admin/hooks/useSuperAdmin";
import { MobileCard, MobileCardList } from "@/features/admin/components/MobileCard";
import { ListSearch, matchesQuery } from "@/features/admin/components/ListSearch";
import { exportToCsv } from "@/lib/csv-export";

type DataRequest = Record<string, unknown>;
type TenantOption = { id: string; name: string };

interface CreateFormState {
  tenant_id: string;
  request_type: string;
  notes: string;
}

const emptyForm: CreateFormState = {
  tenant_id: "",
  request_type: "export",
  notes: "",
};

function getStatusVariant(status: string): "default" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "completed":
      return "success";
    case "processing":
      return "info";
    case "failed":
      return "danger";
    case "pending":
      return "warning";
    default:
      return "default";
  }
}

export function DataRequestsPage() {
  const { t } = useTranslation("admin");
  const superOnly = useSuperAdminOnly();
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<CreateFormState>(emptyForm);

  const { data: dataRequests, isLoading } = useAdminDataRequests();
  const { data: tenantsData } = useAdminTenants();
  const tenants = (tenantsData || []) as unknown as TenantOption[];
  const createDataRequest = useCreateDataRequest();
  const updateDataRequest = useUpdateDataRequest();
  const executeDataRequest = useExecuteDataRequest();

  const [deleteTarget, setDeleteTarget] = useState<DataRequest | null>(null);
  const [confirmName, setConfirmName] = useState("");

  const handleSetStatus = async (id: string, status: string) => {
    await updateDataRequest.mutateAsync({ id, input: { status } });
  };

  const deleteTargetTenantName = String(
    (deleteTarget?.tenant as Record<string, unknown> | undefined)?.name || ""
  );

  const handleExecuteDeletion = async () => {
    if (!deleteTarget) return;
    await executeDataRequest.mutateAsync({
      id: String(deleteTarget.id),
      confirmTenantName: confirmName.trim(),
    });
    setDeleteTarget(null);
    setConfirmName("");
  };

  const handleOpenCreate = () => {
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createDataRequest.mutateAsync(formData as unknown as Record<string, unknown>);
    handleClose();
  };

  const handleDownload = (id: string) => {
    window.open(`/api/admin/data-requests/${id}/download`, "_blank");
  };

  const updateField = (field: keyof CreateFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const allRequests = (dataRequests || []) as DataRequest[];
  const list = allRequests.filter((dr) =>
    matchesQuery(search, (dr.tenant as Record<string, unknown>)?.name, dr.request_type, dr.status)
  );

  const columns = useTableColumns<DataRequest>(
    "admin-data-requests",
    [
      { key: "tenant", label: t("data_requests.tenant"), hideable: false },
      { key: "type", label: t("data_requests.type") },
      { key: "status", label: t("data_requests.status") },
      { key: "requestedBy", label: t("data_requests.requested_by") },
      { key: "created", label: t("data_requests.created") },
      { key: "completed", label: t("data_requests.completed"), isEmpty: (dr) => !dr.completed_at },
      { key: "actions", label: "", hideable: false },
    ],
    list
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  /** The row's actions, shared by the table row and the phone card. */
  const dataRequestActions = (dr: DataRequest): RowAction[] => {
    const open = dr.status === "pending" || dr.status === "processing";
    return [
      {
        key: "download",
        label: t("data_requests.download"),
        icon: Download,
        onSelect: () => handleDownload(String(dr.id)),
        primary: true,
        hidden: !(dr.status === "completed" && dr.request_type === "export"),
      },
      {
        key: "markCompleted",
        label: t("data_requests.mark_completed"),
        icon: Check,
        onSelect: () => handleSetStatus(String(dr.id), "completed"),
        primary: true,
        tone: "success",
        disabled: !superOnly.allowed || updateDataRequest.isPending,
        disabledReason: superOnly.icon.title,
        hidden: !open,
      },
      {
        key: "markFailed",
        label: t("data_requests.mark_failed"),
        icon: X,
        onSelect: () => handleSetStatus(String(dr.id), "failed"),
        disabled: !superOnly.allowed || updateDataRequest.isPending,
        disabledReason: superOnly.icon.title,
        hidden: !open,
      },
      {
        key: "executeDeletion",
        label: t("data_requests.execute_deletion"),
        icon: Trash2,
        onSelect: () => { setDeleteTarget(dr); setConfirmName(""); },
        danger: true,
        disabled: !superOnly.allowed,
        disabledReason: superOnly.icon.title,
        hidden: !(dr.request_type === "deletion" && dr.status === "processing"),
      },
    ];
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("data_requests.title")}
        subtitle={t("data_requests.description")}
        actions={
        <div className="flex flex-col gap-2 max-sm:w-full sm:flex-row sm:items-center">
          <ListSearch
            name="data-request-search"
            value={search}
            onChange={setSearch}
            placeholder={t("data_requests.searchPlaceholder")}
          />
          <ColumnPicker columns={columns} />
        </div>
        }
        secondaryActions={[
          {
            key: "export",
            label: t("data_requests.exportCsv"),
            icon: Download,
            disabled: list.length === 0,
            onSelect: () =>
              exportToCsv(
                list,
                [
                  {
                    header: t("data_requests.tenant"),
                    accessor: (r) => String((r.tenant as Record<string, unknown>)?.name ?? ""),
                  },
                  { header: t("data_requests.type"), accessor: (r) => String(r.request_type ?? "") },
                  { header: t("data_requests.status"), accessor: (r) => String(r.status ?? "") },
                  {
                    header: t("data_requests.created"),
                    accessor: (r) => (r.created_at ? String(r.created_at).slice(0, 10) : ""),
                  },
                  {
                    header: t("data_requests.completed"),
                    accessor: (r) => (r.completed_at ? String(r.completed_at).slice(0, 10) : ""),
                  },
                ],
                "data-requests"
              ),
          },
        ]}
        primaryAction={{ label: t("data_requests.create"), icon: Plus, onClick: handleOpenCreate, ...superOnly.button }}
      />

      <Card>
        <CardContent className="p-0">
          <MobileCardList isEmpty={list.length === 0} emptyLabel={t("data_requests.empty")}>
            {list.map((dr) => {
              const tenant = dr.tenant as Record<string, unknown> | undefined;
              return (
                <MobileCard
                  key={String(dr.id)}
                  title={tenant ? String(tenant.name || "-") : "-"}
                  badges={
                    <>
                      <Badge variant={dr.request_type === "export" ? "info" : "warning"}>
                        {String(dr.request_type || "-")}
                      </Badge>
                      <Badge variant={getStatusVariant(String(dr.status || ""))}>
                        {String(dr.status || "-")}
                      </Badge>
                    </>
                  }
                  fields={[
                    {
                      label: t("data_requests.created"),
                      value: dr.created_at
                        ? new Date(String(dr.created_at)).toLocaleDateString()
                        : "-",
                    },
                    {
                      label: t("data_requests.completed"),
                      value: dr.completed_at
                        ? new Date(String(dr.completed_at)).toLocaleDateString()
                        : "-",
                    },
                  ]}
                  actions={<RowActions actions={dataRequestActions(dr)} />}
                />
              );
            })}
          </MobileCardList>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("data_requests.tenant")}</TableHead>
                  {columns.show("type") && <TableHead>{t("data_requests.type")}</TableHead>}
                  {columns.show("status") && <TableHead>{t("data_requests.status")}</TableHead>}
                  {columns.show("requestedBy") && <TableHead>{t("data_requests.requested_by")}</TableHead>}
                  {columns.show("created") && <TableHead>{t("data_requests.created")}</TableHead>}
                  {columns.show("completed") && <TableHead>{t("data_requests.completed")}</TableHead>}
                  <TableHead className="w-px text-end">{t("data_requests.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((dr) => {
                  const tenant = dr.tenant as Record<string, unknown> | undefined;
                  return (
                    <TableRow key={String(dr.id)}>
                      <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                        {tenant ? String(tenant.name || "-") : "-"}
                      </TableCell>
                      {columns.show("type") && (
                        <TableCell>
                          <Badge variant={dr.request_type === "export" ? "info" : "warning"}>
                            {String(dr.request_type || "-")}
                          </Badge>
                        </TableCell>
                      )}
                      {columns.show("status") && (
                        <TableCell>
                          <Badge variant={getStatusVariant(String(dr.status || ""))}>
                            {String(dr.status || "-")}
                          </Badge>
                        </TableCell>
                      )}
                      {columns.show("requestedBy") && (
                        <TableCell className="text-gray-600 dark:text-gray-400 text-xs">
                          {String(dr.requested_by || "-").slice(0, 8)}...
                        </TableCell>
                      )}
                      {columns.show("created") && (
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {dr.created_at
                            ? new Date(String(dr.created_at)).toLocaleDateString()
                            : "-"}
                        </TableCell>
                      )}
                      {columns.show("completed") && (
                        <TableCell className="text-gray-600 dark:text-gray-400">
                          {dr.completed_at
                            ? new Date(String(dr.completed_at)).toLocaleDateString()
                            : "-"}
                        </TableCell>
                      )}
                      <TableCell>
                        <RowActions actions={dataRequestActions(dr)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {list.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={columns.visibleCount} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("data_requests.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleClose}
        title={t("data_requests.create")}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            name="data-request-tenant-id"
            label={t("data_requests.tenant")}
            value={formData.tenant_id}
            onChange={(e) => updateField("tenant_id", e.target.value)}
            required
            options={[
              { value: "", label: t("data_requests.select_tenant") },
              ...tenants.map((tenant) => ({ value: tenant.id, label: tenant.name })),
            ]}
          />

          <Select
            name="data-request-type"
            label={t("data_requests.request_type")}
            value={formData.request_type}
            onChange={(e) => updateField("request_type", e.target.value)}
            options={[
              { value: "export", label: t("data_requests.type_export") },
              { value: "deletion", label: t("data_requests.type_deletion") },
            ]}
          />

          <Textarea
            name="data-request-notes"
            label={t("data_requests.notes")}
            value={formData.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            rows={3}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="secondary" type="button" onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Button
  {...superOnly.button} type="submit" isLoading={createDataRequest.isPending}>
              {t("common.create")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Execute-deletion confirmation (typed-name gate) */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("data_requests.execute_deletion")}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
            {t("data_requests.execute_warning", { name: deleteTargetTenantName })}
          </div>
          <Input
            name="confirm-tenant-name"
            label={t("data_requests.execute_confirm_label", { name: deleteTargetTenantName })}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            autoComplete="off"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              {...superOnly.button}
              variant="danger"
              onClick={handleExecuteDeletion}
              isLoading={executeDataRequest.isPending}
              disabled={confirmName.trim() !== deleteTargetTenantName || !deleteTargetTenantName}
            >
              {t("data_requests.execute_deletion")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
