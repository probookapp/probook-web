import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TagChip } from "@/components/ui";
import { Tag as TagIcon } from "lucide-react";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useSetDocumentTags } from "@/hooks/useTags";
import { toast } from "@/stores/useToastStore";
import { getApiErrorMessage } from "@/lib/api-adapter";
import type { TaggableDocument } from "@/lib/document-tags";
import type { Tag } from "@/types";
import { TagPicker } from "./TagPicker";
import { TagsModal } from "./TagsModal";

interface Props {
  document: TaggableDocument;
  id: string;
  tags: Tag[] | undefined;
  /** False for a reader: the labels are shown, not editable. */
  canEdit: boolean;
}

/**
 * The labels on a document, on the document's own page.
 *
 * Here rather than only in the editor because of the invoice: once issued, an
 * invoice is immutable — its update route accepts nothing, since issuing
 * snapshots the integrity hash, the stamp duty and the stock. Labels are none of
 * those things, and an invoice you cannot file is an invoice you cannot find, so
 * they change through their own endpoint at any status.
 *
 * Read-only collapses to the chips alone: a reader still wants to see that this
 * is the Hydra job.
 */
export function DocumentTagsRow({ document, id, tags, canEdit }: Props) {
  const { t } = useTranslation("common");
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const setTags = useSetDocumentTags(document);
  const [editing, setEditing] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  // Kept locally while the row is open so the chips follow the clicks instead of
  // waiting for a round trip per tick; re-seeded whenever the document is
  // refetched, which is what makes the server the source of truth.
  const [selected, setSelected] = useState<string[]>([]);

  const attached = tags ?? [];

  useEffect(() => {
    setSelected(attached.map((tag) => tag.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the ids, not the array identity
  }, [attached.map((tag) => tag.id).join(",")]);

  if (!canEdit) {
    if (attached.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {attached.map((tag) => (
          <TagChip key={tag.id} name={tag.name} color={tag.color} />
        ))}
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {attached.map((tag) => (
          <TagChip key={tag.id} name={tag.name} color={tag.color} />
        ))}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
        >
          <TagIcon className="h-3.5 w-3.5" />
          {attached.length === 0 ? t("tags.addLabels") : t("tags.editLabels")}
        </button>
      </div>
    );
  }

  const save = async (ids: string[]) => {
    if (isDemoMode) {
      showSubscribePrompt();
      return;
    }
    setSelected(ids);
    try {
      await setTags.mutateAsync({ id, tagIds: ids });
    } catch (err) {
      // Put the chips back: a label that looks attached and is not is worse
      // than a label that failed to attach.
      setSelected(attached.map((tag) => tag.id));
      toast.error(getApiErrorMessage(err, t("messages.error")));
    }
  };

  return (
    <div className="w-full">
      <TagPicker value={selected} onChange={save} onManage={() => setManageOpen(true)} />
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="mt-2 text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary)"
      >
        {t("buttons.done")}
      </button>
      <TagsModal isOpen={manageOpen} onClose={() => setManageOpen(false)} canEdit />
    </div>
  );
}
