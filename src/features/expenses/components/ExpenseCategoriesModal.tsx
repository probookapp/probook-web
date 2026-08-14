import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button, Input, Modal } from "@/components/ui";
import { expenseCategoryApi } from "@/lib/api";
import { useToastStore } from "@/stores/useToastStore";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_EXPENSE_CATEGORIES } from "@/lib/demo-data";
import { EXPENSE_CATEGORY_MAX_LENGTH } from "@/lib/expense-categories";
import type { ExpenseCategory } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Managing the headings themselves.
 *
 * Headings are created by simply typing one in the expense form, so this exists
 * for the other half: fixing a typo without re-filing every expense, and
 * dropping a heading that turned out to be a duplicate. Deleting one never
 * deletes the spending recorded under it — those expenses go back to unfiled.
 */
export function ExpenseCategoriesModal({ isOpen, onClose, canEdit, canDelete }: Props) {
  const { t } = useTranslation("expenses");
  const { t: tCommon } = useTranslation("common");
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [newName, setNewName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["expense-categories", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_EXPENSE_CATEGORIES : () => expenseCategoryApi.getAll(),
    enabled: isOpen,
    staleTime: isDemoMode ? Infinity : undefined,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
    // Expenses carry their heading's name, so a rename has to reach the list too.
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["reports"] });
  };

  const createCategory = useMutation({
    mutationFn: (name: string) => expenseCategoryApi.create(name),
    onSuccess: () => {
      refresh();
      setNewName("");
      addToast({ type: "success", message: t("categories.created") });
    },
    onError: () => addToast({ type: "error", message: t("categories.saveError") }),
  });

  const renameCategory = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => expenseCategoryApi.update(id, name),
    onSuccess: () => {
      refresh();
      setEditingId(null);
      addToast({ type: "success", message: t("categories.renamed") });
    },
    onError: () => addToast({ type: "error", message: t("categories.saveError") }),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => expenseCategoryApi.delete(id),
    onSuccess: () => {
      refresh();
      setConfirmDeleteId(null);
      addToast({ type: "success", message: t("categories.deleted") });
    },
    onError: () => addToast({ type: "error", message: t("categories.deleteError") }),
  });

  const guard = () => {
    if (isDemoMode) {
      showSubscribePrompt();
      return false;
    }
    return true;
  };

  const startEditing = (category: ExpenseCategory) => {
    setEditingId(category.id);
    setDraftName(category.name);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("categories.title")} size="md">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t("categories.description")}</p>

      {canEdit && (
        <form
          className="flex gap-2 mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newName.trim();
            if (!name || !guard()) return;
            createCategory.mutate(name);
          }}
        >
          <Input
            id="new-expense-category"
            name="new-expense-category"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("categories.newPlaceholder")}
            maxLength={EXPENSE_CATEGORY_MAX_LENGTH}
            autoComplete="off"
            className="flex-1"
          />
          <Button type="submit" isLoading={createCategory.isPending} disabled={!newName.trim()}>
            {tCommon("buttons.add")}
          </Button>
        </form>
      )}

      <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-80 overflow-y-auto">
        {isLoading && (
          <p className="py-6 text-center text-gray-500 dark:text-gray-400">{tCommon("messages.loading")}</p>
        )}
        {!isLoading && (categories?.length ?? 0) === 0 && (
          <p className="py-6 text-center text-gray-500 dark:text-gray-400">{t("categories.empty")}</p>
        )}
        {categories?.map((category) => (
          <div key={category.id} className="py-2 flex items-center gap-2">
            {editingId === category.id ? (
              <>
                <Input
                  id={`rename-${category.id}`}
                  name={`rename-${category.id}`}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  maxLength={EXPENSE_CATEGORY_MAX_LENGTH}
                  autoComplete="off"
                  className="flex-1"
                />
                <button
                  type="button"
                  className="p-1 text-gray-500 hover:text-primary-600"
                  title={tCommon("buttons.save")}
                  aria-label={tCommon("buttons.save")}
                  onClick={() => {
                    const name = draftName.trim();
                    if (!name || !guard()) return;
                    renameCategory.mutate({ id: category.id, name });
                  }}
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
                  title={tCommon("buttons.cancel")}
                  aria-label={tCommon("buttons.cancel")}
                  onClick={() => setEditingId(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-gray-900 dark:text-gray-100">{category.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t("categories.usage", { count: category.expense_count })}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    className="p-1 text-gray-500 hover:text-primary-600"
                    title={tCommon("buttons.edit")}
                    aria-label={`${tCommon("buttons.edit")} ${category.name}`}
                    onClick={() => startEditing(category)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="p-1 text-gray-500 hover:text-red-600"
                    title={tCommon("buttons.delete")}
                    aria-label={`${tCommon("buttons.delete")} ${category.name}`}
                    onClick={() => setConfirmDeleteId(category.id)}
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
        title={tCommon("messages.confirmDelete")}
        size="sm"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-6">{t("categories.deleteConfirmation")}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button
            variant="danger"
            isLoading={deleteCategory.isPending}
            onClick={() => {
              if (!confirmDeleteId || !guard()) return;
              deleteCategory.mutate(confirmDeleteId);
            }}
          >
            {tCommon("buttons.delete")}
          </Button>
        </div>
      </Modal>
    </Modal>
  );
}
