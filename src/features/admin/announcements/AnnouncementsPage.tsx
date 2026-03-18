"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2 } from "lucide-react";
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

type Announcement = Record<string, unknown>;

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState<AnnouncementFormState>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: announcements, isLoading } = useAdminAnnouncements();
  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();

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

  const list = (announcements || []) as Announcement[];

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
        <Button onClick={handleOpenCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          {t("announcements.create")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("announcements.field_title")}</TableHead>
                  <TableHead>{t("announcements.target")}</TableHead>
                  <TableHead>{t("announcements.published")}</TableHead>
                  <TableHead>{t("announcements.expires")}</TableHead>
                  <TableHead className="text-right">{t("announcements.actions")}</TableHead>
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
                    <TableCell className="text-right">
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
                    <TableCell colSpan={5} className="text-center text-gray-500 dark:text-gray-400 py-8">
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
              onChange={(e) => updateField("target_type", e.target.value)}
              options={[
                { value: "all", label: t("announcements.target_all") },
                { value: "plan", label: t("announcements.target_plan") },
                { value: "tenant", label: t("announcements.target_tenant") },
              ]}
            />
            <Input
              name="announcement-target-id"
              label={t("announcements.target_id")}
              value={formData.target_id}
              onChange={(e) => updateField("target_id", e.target.value)}
              placeholder={t("announcements.target_id_placeholder")}
              disabled={formData.target_type === "all"}
            />
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
