"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Download } from "lucide-react";
import { exportToCsv } from "@/lib/csv-export";
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
import {
  useAdminAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
} from "./hooks/useAnnouncements";
import { useAdminTenants } from "@/features/admin/tenants/hooks/useTenants";
import { useAdminPlans } from "@/features/admin/plans/hooks/usePlans";
import { useSuperAdminOnly } from "@/features/admin/hooks/useSuperAdmin";
import { MobileCard, MobileCardList } from "@/features/admin/components/MobileCard";
import { ListSearch, matchesQuery } from "@/features/admin/components/ListSearch";

type Announcement = Record<string, unknown>;
type NamedOption = { id: string; name?: string; slug?: string };

interface AnnouncementFormState {
  title: string;
  body: string;
  body_html: string;
  target_type: string;
  target_id: string;
  published_at: string;
  expires_at: string;
}

const emptyForm: AnnouncementFormState = {
  title: "",
  body: "",
  body_html: "",
  target_type: "all",
  target_id: "",
  published_at: "",
  expires_at: "",
};

export function AnnouncementsPage() {
  const { t } = useTranslation("admin");
  const superOnly = useSuperAdminOnly();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState<AnnouncementFormState>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: announcements, isLoading } = useAdminAnnouncements();
  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();

  const { data: tenantsData } = useAdminTenants();
  const { data: plansData } = useAdminPlans();
  const tenants = (tenantsData || []) as unknown as NamedOption[];
  const plans = (plansData || []) as unknown as NamedOption[];

  const handleOpenCreate = () => {
    setEditingAnnouncement(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: String(announcement.title || ""),
      body: String(announcement.body || ""),
      body_html: String(announcement.body_html || ""),
      target_type: String(announcement.target_type || "all"),
      target_id: String(announcement.target_id || ""),
      published_at: announcement.published_at
        ? new Date(String(announcement.published_at)).toISOString().slice(0, 16)
        : "",
      expires_at: announcement.expires_at
        ? new Date(String(announcement.expires_at)).toISOString().slice(0, 16)
        : "",
    });
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingAnnouncement(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: Record<string, unknown> = {
      title: formData.title,
      body: formData.body,
      body_html: formData.body_html || null,
      target_type: formData.target_type,
      target_id: formData.target_id || null,
      published_at: formData.published_at || null,
      expires_at: formData.expires_at || null,
    };

    if (editingAnnouncement) {
      input.id = editingAnnouncement.id;
      await updateAnnouncement.mutateAsync(input);
    } else {
      await createAnnouncement.mutateAsync(input);
    }
    handleClose();
  };

  const handleDelete = async (id: string) => {
    await deleteAnnouncement.mutateAsync(id);
    setDeleteConfirmId(null);
  };

  const updateField = (field: keyof AnnouncementFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const allAnnouncements = (announcements || []) as Announcement[];
  const list = allAnnouncements.filter((a) => matchesQuery(search, a.title, a.body));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t("announcements.title")}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
            {t("announcements.description")}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center self-start sm:self-auto">
          <ListSearch
            name="announcement-search"
            value={search}
            onChange={setSearch}
            placeholder={t("announcements.searchPlaceholder")}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={list.length === 0}
            onClick={() =>
              exportToCsv(
                list,
                [
                  { header: t("announcements.field_title"), accessor: (r) => String(r.title ?? "") },
                  { header: t("announcements.target"), accessor: (r) => String(r.target_type ?? "") },
                  {
                    header: t("announcements.published"),
                    accessor: (r) => (r.published_at ? String(r.published_at).slice(0, 10) : ""),
                  },
                  {
                    header: t("announcements.expires"),
                    accessor: (r) => (r.expires_at ? String(r.expires_at).slice(0, 10) : ""),
                  },
                  { header: t("announcements.dismissals"), accessor: (r) => Number(r.dismissal_count ?? 0) },
                ],
                "announcements"
              )
            }
          >
            <Download className="h-4 w-4 mr-2" />
            {t("announcements.exportCsv")}
          </Button>
          <Button {...superOnly.button} onClick={handleOpenCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {t("announcements.create")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <MobileCardList isEmpty={list.length === 0} emptyLabel={t("announcements.empty")}>
            {list.map((a) => (
              <MobileCard
                key={String(a.id)}
                title={String(a.title || "-")}
                badges={
                  <Badge variant={a.target_type === "all" ? "default" : "info"}>
                    {String(a.target_type || "all")}
                  </Badge>
                }
                fields={[
                  {
                    label: t("announcements.published"),
                    value: a.published_at
                      ? new Date(String(a.published_at)).toLocaleDateString()
                      : "-",
                  },
                  {
                    label: t("announcements.expires"),
                    value: a.expires_at ? new Date(String(a.expires_at)).toLocaleDateString() : "-",
                  },
                  {
                    label: t("announcements.dismissals"),
                    value: String(a.dismissal_count ?? 0),
                  },
                ]}
                actions={
                  <>
                    <Button
                      {...superOnly.button}
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenEdit(a)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      {...superOnly.button}
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteConfirmId(String(a.id))}
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
                  <TableHead>{t("announcements.field_title")}</TableHead>
                  <TableHead>{t("announcements.target")}</TableHead>
                  <TableHead>{t("announcements.published")}</TableHead>
                  <TableHead>{t("announcements.expires")}</TableHead>
                  <TableHead>{t("announcements.dismissals")}</TableHead>
                  <TableHead className="text-end">{t("announcements.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((a) => (
                  <TableRow key={String(a.id)}>
                    <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                      {String(a.title || "-")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.target_type === "all" ? "default" : "info"}>
                        {String(a.target_type || "all")}
                      </Badge>
                      {a.target_id ? (
                        <span className="ml-1 text-xs text-gray-400">
                          ({String(a.target_id).slice(0, 8)}...)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {a.published_at
                        ? new Date(String(a.published_at)).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      {a.expires_at
                        ? new Date(String(a.expires_at)).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">
                      <Badge variant="default">{String(a.dismissal_count ?? 0)}</Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenEdit(a)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeleteConfirmId(String(a.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {list.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 dark:text-gray-400 py-8">
                      {t("announcements.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleClose}
        title={editingAnnouncement ? t("announcements.edit") : t("announcements.create")}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            name="announcement-title"
            label={t("announcements.field_title")}
            value={formData.title}
            onChange={(e) => updateField("title", e.target.value)}
            required
            placeholder={t("announcements.title_placeholder")}
          />

          <Textarea
            name="announcement-body"
            label={t("announcements.body")}
            value={formData.body}
            onChange={(e) => updateField("body", e.target.value)}
            rows={3}
            required
          />

          <Textarea
            name="announcement-body-html"
            label={t("announcements.body_html")}
            value={formData.body_html}
            onChange={(e) => updateField("body_html", e.target.value)}
            rows={3}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              name="announcement-target-type"
              label={t("announcements.target_type")}
              value={formData.target_type}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, target_type: e.target.value, target_id: "" }))
              }
              options={[
                { value: "all", label: t("announcements.target_all") },
                { value: "plan", label: t("announcements.target_plan") },
                { value: "tenant", label: t("announcements.target_tenant") },
              ]}
            />
            {formData.target_type === "tenant" ? (
              <Select
                name="announcement-target-tenant"
                label={t("announcements.target_tenant")}
                value={formData.target_id}
                onChange={(e) => updateField("target_id", e.target.value)}
                required
                options={[
                  { value: "", label: t("announcements.select_target") },
                  ...tenants.map((tn) => ({ value: tn.id, label: String(tn.name || tn.id) })),
                ]}
              />
            ) : formData.target_type === "plan" ? (
              <Select
                name="announcement-target-plan"
                label={t("announcements.target_plan")}
                value={formData.target_id}
                onChange={(e) => updateField("target_id", e.target.value)}
                required
                options={[
                  { value: "", label: t("announcements.select_target") },
                  ...plans.map((pl) => ({ value: pl.id, label: String(pl.name || pl.slug || pl.id) })),
                ]}
              />
            ) : (
              <div />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              name="announcement-published-at"
              label={t("announcements.published_at")}
              type="datetime-local"
              value={formData.published_at}
              onChange={(e) => updateField("published_at", e.target.value)}
            />
            <Input
              name="announcement-expires-at"
              label={t("announcements.expires_at")}
              type="datetime-local"
              value={formData.expires_at}
              onChange={(e) => updateField("expires_at", e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="secondary" type="button" onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              isLoading={createAnnouncement.isPending || updateAnnouncement.isPending}
            >
              {editingAnnouncement ? t("common.update") : t("common.create")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title={t("announcements.delete_confirm_title")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t("announcements.delete_confirm_message")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            {...superOnly.button}
            variant="danger"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            isLoading={deleteAnnouncement.isPending}
          >
            {t("common.delete")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
