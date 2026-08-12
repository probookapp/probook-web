"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Download } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Modal,
  Input,
  Badge,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import {
  usePlatformAdmins,
  useCreatePlatformAdmin,
  useUpdatePlatformAdmin,
  useDeletePlatformAdmin,
} from "./hooks/usePlatformAdmins";
import { AdminSecuritySection } from "./AdminSecuritySection";
import { useSuperAdminOnly } from "@/features/admin/hooks/useSuperAdmin";
import { MobileCard, MobileCardList } from "@/features/admin/components/MobileCard";
import { ListSearch, matchesQuery } from "@/features/admin/components/ListSearch";
import { exportToCsv } from "@/lib/csv-export";

type PlatformAdmin = Record<string, unknown>;

interface AdminFormState {
  username: string;
  display_name: string;
  email: string;
  password: string;
  role: string;
  is_active: boolean;
}

const emptyForm: AdminFormState = {
  username: "",
  display_name: "",
  email: "",
  password: "",
  role: "support_agent",
  is_active: true,
};

export function PlatformAdminsPage() {
  const { t } = useTranslation("admin");
  const superOnly = useSuperAdminOnly();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingAdmin, setDeletingAdmin] = useState<PlatformAdmin | null>(null);
  const [search, setSearch] = useState("");
  const [editingAdmin, setEditingAdmin] = useState<PlatformAdmin | null>(null);
  const [formData, setFormData] = useState<AdminFormState>(emptyForm);

  const { data: admins, isLoading } = usePlatformAdmins();
  const createAdmin = useCreatePlatformAdmin();
  const updateAdmin = useUpdatePlatformAdmin();
  const deleteAdmin = useDeletePlatformAdmin();

  const handleOpenCreate = () => {
    setEditingAdmin(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (admin: PlatformAdmin) => {
    setEditingAdmin(admin);
    setFormData({
      username: String(admin.username || ""),
      display_name: String(admin.display_name || ""),
      email: String(admin.email || ""),
      password: "",
      role: String(admin.role || "support_agent"),
      is_active: Boolean(admin.is_active),
    });
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingAdmin(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingAdmin) {
      const input: Record<string, unknown> = {
        id: editingAdmin.id,
        username: formData.username,
        display_name: formData.display_name,
        email: formData.email,
        role: formData.role,
        is_active: formData.is_active,
      };
      if (formData.password) {
        input.password = formData.password;
      }
      await updateAdmin.mutateAsync(input);
    } else {
      await createAdmin.mutateAsync({
        username: formData.username,
        display_name: formData.display_name,
        email: formData.email,
        password: formData.password,
        role: formData.role,
      });
    }
    handleClose();
  };

  const handleDelete = async () => {
    if (!deletingAdmin) return;
    await deleteAdmin.mutateAsync(String(deletingAdmin.id));
    setDeletingAdmin(null);
  };

  const updateField = (field: keyof AdminFormState, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const allAdmins = (admins || []) as PlatformAdmin[];
  const adminList = allAdmins.filter((a) =>
    matchesQuery(search, a.username, a.display_name, a.email)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t("platformAdmins.title")}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
            {t("platformAdmins.description")}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center self-start sm:self-auto">
          <ListSearch
            name="platform-admin-search"
            value={search}
            onChange={setSearch}
            placeholder={t("platformAdmins.searchPlaceholder")}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={adminList.length === 0}
            onClick={() =>
              exportToCsv(
                adminList as unknown as Record<string, unknown>[],
                [
                  { header: t("platformAdmins.username"), accessor: (r) => String(r.username ?? "") },
                  { header: t("platformAdmins.displayName"), accessor: (r) => String(r.display_name ?? "") },
                  { header: t("platformAdmins.email"), accessor: (r) => String(r.email ?? "") },
                  { header: t("platformAdmins.role"), accessor: (r) => String(r.role ?? "") },
                  { header: t("platformAdmins.active"), accessor: (r) => (r.is_active ? "yes" : "no") },
                ],
                "platform-admins"
              )
            }
          >
            <Download className="h-4 w-4 mr-2" />
            {t("platformAdmins.exportCsv")}
          </Button>
          <Button {...superOnly.button} onClick={handleOpenCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t("platformAdmins.create")}
          </Button>
        </div>
      </div>

      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          {t("security.title")}
        </h2>
        <AdminSecuritySection />
      </div>

      <Card>
        <CardContent className="p-0">
          <MobileCardList isEmpty={adminList.length === 0} emptyLabel={t("platformAdmins.empty")}>
            {adminList.map((admin) => (
              <MobileCard
                key={String(admin.id)}
                title={String(admin.username || "-")}
                subtitle={String(admin.email || "")}
                badges={
                  <>
                    <Badge variant={admin.role === "super_admin" ? "warning" : "default"}>
                      {admin.role === "super_admin"
                        ? t("platformAdmins.superAdmin")
                        : t("platformAdmins.supportAgent")}
                    </Badge>
                    <Badge variant={admin.is_active ? "success" : "danger"}>
                      {admin.is_active ? t("common.yes") : t("common.no")}
                    </Badge>
                  </>
                }
                fields={[
                  { label: t("platformAdmins.displayName"), value: String(admin.display_name || "-") },
                  {
                    label: t("platformAdmins.created"),
                    value: admin.created_at
                      ? new Date(String(admin.created_at)).toLocaleDateString()
                      : "-",
                  },
                ]}
                actions={
                  <>
                    <Button
                      {...superOnly.button}
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenEdit(admin)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      {...superOnly.button}
                      variant="danger"
                      size="sm"
                      onClick={() => setDeletingAdmin(admin)}
                      aria-label={t("platformAdmins.delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                }
              />
            ))}
          </MobileCardList>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("platformAdmins.username")}</TableHead>
                  <TableHead>{t("platformAdmins.displayName")}</TableHead>
                  <TableHead>{t("platformAdmins.email")}</TableHead>
                  <TableHead>{t("platformAdmins.role")}</TableHead>
                  <TableHead>{t("platformAdmins.active")}</TableHead>
                  <TableHead>{t("platformAdmins.created")}</TableHead>
                  <TableHead>{t("platformAdmins.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminList.map((admin) => (
                  <TableRow key={String(admin.id)}>
                    <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                      {String(admin.username || "-")}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {String(admin.display_name || "-")}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {String(admin.email || "-")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={admin.role === "super_admin" ? "warning" : "default"}>
                        {admin.role === "super_admin"
                          ? t("platformAdmins.superAdmin")
                          : t("platformAdmins.supportAgent")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={admin.is_active ? "success" : "danger"}>
                        {admin.is_active ? t("common.yes") : t("common.no")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {admin.created_at
                        ? new Date(String(admin.created_at)).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenEdit(admin)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          {...superOnly.button}
                          variant="danger"
                          size="sm"
                          onClick={() => setDeletingAdmin(admin)}
                          aria-label={t("platformAdmins.delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {adminList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("platformAdmins.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Modal
        isOpen={!!deletingAdmin}
        onClose={() => setDeletingAdmin(null)}
        title={t("platformAdmins.deleteTitle")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("platformAdmins.confirmDelete", { username: String(deletingAdmin?.username || "") })}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeletingAdmin(null)}>
            {t("platformAdmins.cancel")}
          </Button>
          <Button
            {...superOnly.button}
            variant="danger"
            onClick={handleDelete}
            isLoading={deleteAdmin.isPending}
          >
            {t("platformAdmins.delete")}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={handleClose}
        title={editingAdmin ? t("platformAdmins.editTitle") : t("platformAdmins.createTitle")}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            name="admin-username"
            label={t("platformAdmins.username")}
            value={formData.username}
            onChange={(e) => updateField("username", e.target.value)}
            required
            placeholder="admin_username"
          />
          <Input
            name="admin-display-name"
            label={t("platformAdmins.displayName")}
            value={formData.display_name}
            onChange={(e) => updateField("display_name", e.target.value)}
            required
          />
          <Input
            name="admin-email"
            label={t("platformAdmins.email")}
            type="email"
            value={formData.email}
            onChange={(e) => updateField("email", e.target.value)}
            required
          />
          <Input
            name="admin-password"
            label={editingAdmin ? t("platformAdmins.newPassword") : t("platformAdmins.password")}
            type="password"
            value={formData.password}
            onChange={(e) => updateField("password", e.target.value)}
            required={!editingAdmin}
            minLength={6}
            placeholder={editingAdmin ? t("platformAdmins.passwordPlaceholder") : ""}
          />
          <Select
            name="admin-role"
            label={t("platformAdmins.role")}
            value={formData.role}
            onChange={(e) => updateField("role", e.target.value)}
            options={[
              { value: "super_admin", label: t("platformAdmins.superAdmin") },
              { value: "support_agent", label: t("platformAdmins.supportAgent") },
            ]}
          />
          {editingAdmin && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => updateField("is_active", e.target.checked)}
                  className="rounded border-gray-300"
                />
                {t("platformAdmins.isActive")}
              </label>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="secondary" type="button" onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              isLoading={createAdmin.isPending || updateAdmin.isPending}
            >
              {editingAdmin ? t("platformAdmins.update") : t("platformAdmins.createSubmit")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
