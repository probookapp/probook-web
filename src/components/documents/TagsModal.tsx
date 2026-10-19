import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button, Input, Modal, TagChip } from "@/components/ui";
import { useToastStore } from "@/stores/useToastStore";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEFAULT_TAG_COLOR, TAG_MAX_LENGTH, type TagColor } from "@/lib/tag-colors";
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from "@/hooks/useTags";
import { TagColorChoice } from "./TagColorChoice";
import type { Tag } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  canEdit: boolean;
}

/**
 * Managing the labels themselves.
 *
 * This is the answer to "can we add our own statuses?". The states a quote
 * moves through are a fixed machine — the expiry sweep, the relance alerts, the
 * conversion to an invoice and the conversion-rate report all read them, so an
 * invented state would drop a document out of all four in silence. What a
 * business genuinely needs is its own vocabulary on a second axis, and that is
 * what this list is: words, freely chosen, that classify without changing what
 * a document is or what it owes.
 *
 * Deleting a label never touches the quotes that wore it. That is the whole
 * difference, and the reason this is safe to hand to the user.
 */
export function TagsModal({ isOpen, onClose, canEdit }: Props) {
  const { t } = useTranslation("common");
  const addToast = useToastStore((s) => s.addToast);
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { data: tags, isLoading } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagColor>(DEFAULT_TAG_COLOR);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState<TagColor>(DEFAULT_TAG_COLOR);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const guard = () => {
    if (isDemoMode) {
      showSubscribePrompt();
      return false;
    }
    return true;
  };

  const startEditing = (tag: Tag) => {
    setEditingId(tag.id);
    setDraftName(tag.name);
    setDraftColor((tag.color || DEFAULT_TAG_COLOR) as TagColor);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !guard()) return;
    try {
      await createTag.mutateAsync({ name, color: newColor });
      setNewName("");
      setNewColor(DEFAULT_TAG_COLOR);
      addToast({ type: "success", message: t("tags.created") });
    } catch {
      addToast({ type: "error", message: t("tags.saveError") });
    }
  };

  const handleRename = async (id: string) => {
    const name = draftName.trim();
    if (!name || !guard()) return;
    try {
      await updateTag.mutateAsync({ id, input: { name, color: draftColor } });
      setEditingId(null);
      addToast({ type: "success", message: t("tags.renamed") });
    } catch {
      addToast({ type: "error", message: t("tags.saveError") });
    }
  };

  const handleDelete = async (id: string) => {
    if (!guard()) return;
    try {
      await deleteTag.mutateAsync(id);
      setConfirmDeleteId(null);
      addToast({ type: "success", message: t("tags.deleted") });
    } catch {
      addToast({ type: "error", message: t("tags.deleteError") });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("tags.title")} size="md">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {t("tags.description")}
      </p>

      {canEdit && (
        <form
          className="mb-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <div className="flex gap-2">
            <Input
              id="new-tag"
              name="new-tag"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("tags.newPlaceholder")}
              maxLength={TAG_MAX_LENGTH}
              autoComplete="off"
              className="flex-1"
            />
            <Button type="submit" isLoading={createTag.isPending} disabled={!newName.trim()}>
              {t("buttons.add")}
            </Button>
          </div>
          <TagColorChoice value={newColor} onChange={setNewColor} idPrefix="new-tag" />
        </form>
      )}

      <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-80 overflow-y-auto">
        {isLoading && (
          <p className="py-6 text-center text-gray-500 dark:text-gray-400">
            {t("messages.loading")}
          </p>
        )}
        {!isLoading && (tags?.length ?? 0) === 0 && (
          <p className="py-6 text-center text-gray-500 dark:text-gray-400">
            {t("tags.empty")}
          </p>
        )}
        {tags?.map((tag) => (
          <div key={tag.id} className="py-2 flex flex-wrap items-center gap-2">
            {editingId === tag.id ? (
              <>
                <Input
                  id={`rename-tag-${tag.id}`}
                  name={`rename-tag-${tag.id}`}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  maxLength={TAG_MAX_LENGTH}
                  autoComplete="off"
                  className="flex-1 min-w-40"
                />
                <TagColorChoice value={draftColor} onChange={setDraftColor} idPrefix={tag.id} />
                <button
                  type="button"
                  className="p-3 lg:p-1.5 rounded-md text-gray-500 hover:text-primary-600"
                  title={t("buttons.save")}
                  aria-label={t("buttons.save")}
                  onClick={() => void handleRename(tag.id)}
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="p-3 lg:p-1.5 rounded-md text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
                  title={t("buttons.cancel")}
                  aria-label={t("buttons.cancel")}
                  onClick={() => setEditingId(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1">
                  <TagChip name={tag.name} color={tag.color} />
                </span>
                {canEdit && (
                  <button
                    type="button"
                    className="p-3 lg:p-1.5 rounded-md text-gray-500 hover:text-primary-600"
                    title={t("buttons.edit")}
                    aria-label={`${t("buttons.edit")} ${tag.name}`}
                    onClick={() => startEditing(tag)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    className="p-3 lg:p-1.5 rounded-md text-gray-500 hover:text-red-600"
                    title={t("buttons.delete")}
                    aria-label={`${t("buttons.delete")} ${tag.name}`}
                    onClick={() => setConfirmDeleteId(tag.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <Modal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title={t("messages.confirmDelete")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6 wrap-anywhere">
          {t("tags.deleteConfirmation")}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
            {t("buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            isLoading={deleteTag.isPending}
            onClick={() => confirmDeleteId && void handleDelete(confirmDeleteId)}
          >
            {t("buttons.delete")}
          </Button>
        </div>
      </Modal>
    </Modal>
  );
}
