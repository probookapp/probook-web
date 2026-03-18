"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Download } from "lucide-react";
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
} from "@/components/ui";
import { useAdminDataRequests, useCreateDataRequest } from "./hooks/useDataRequests";

type DataRequest = Record<string, unknown>;

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<CreateFormState>(emptyForm);

  const { data: dataRequests, isLoading } = useAdminDataRequests();
  const createDataRequest = useCreateDataRequest();

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const list = (dataRequests || []) as DataRequest[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t("data_requests.title")}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
            {t("data_requests.description")}
          </p>
        </div>
        <Button onClick={handleOpenCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          {t("data_requests.create")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("data_requests.tenant")}</TableHead>
                  <TableHead>{t("data_requests.type")}</TableHead>
                  <TableHead>{t("data_requests.status")}</TableHead>
                  <TableHead>{t("data_requests.requested_by")}</TableHead>
                  <TableHead>{t("data_requests.created")}</TableHead>
                  <TableHead>{t("data_requests.completed")}</TableHead>
                  <TableHead className="text-right">{t("data_requests.actions")}</TableHead>
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
                      <TableCell>
                        <Badge variant={dr.request_type === "export" ? "info" : "warning"}>
                          {String(dr.request_type || "-")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(String(dr.status || ""))}>
                          {String(dr.status || "-")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400 text-xs">
                        {String(dr.requested_by || "-").slice(0, 8)}...
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {dr.created_at
                          ? new Date(String(dr.created_at)).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-gray-400">
                        {dr.completed_at
                          ? new Date(String(dr.completed_at)).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {dr.status === "completed" && dr.request_type === "export" && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDownload(String(dr.id))}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            {t("data_requests.download")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {list.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 dark:text-gray-400 py-8">
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
          <Input
            name="data-request-tenant-id"
            label={t("data_requests.tenant_id")}
            value={formData.tenant_id}
            onChange={(e) => updateField("tenant_id", e.target.value)}
            required
            placeholder={t("data_requests.tenant_id_placeholder")}
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
            <Button type="submit" isLoading={createDataRequest.isPending}>
              {t("common.create")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
