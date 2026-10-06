import { useTranslation } from "react-i18next";
import { Check, Tag as TagIcon } from "lucide-react";
import { TagChip, fieldLabel } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useTags } from "@/hooks/useTags";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  /** Opens the label manager — the only place labels are created. */
  onManage?: () => void;
}

/**
 * Attaching labels to a quote.
 *
 * Toggles, not a select: a document wears several labels at once, and the ones
 * it wears have to be readable at a glance rather than hidden behind a closed
 * dropdown. Labels are not created here on the fly — a typo would otherwise
 * become a permanent second label that splits every filter in two.
 */
export function TagPicker({ value, onChange, onManage }: Props) {
  const { t } = useTranslation("common");
  const { data: tags } = useTags();

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className={fieldLabel}>{t("tags.label")}</span>
        {onManage && (
          <button
            type="button"
            onClick={onManage}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            <TagIcon className="h-3.5 w-3.5" />
            {t("tags.manage")}
          </button>
        )}
      </div>

      {(tags?.length ?? 0) === 0 ? (
        <p className="text-sm text-(--color-text-secondary)">{t("tags.emptyHint")}</p>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("tags.label")}>
          {tags?.map((tag) => {
            const selected = value.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(tag.id)}
                // Unselected labels are shown faded rather than hidden: the
                // point of the row is to see the whole vocabulary and pick
                // from it, not to guess what exists.
                className={cn(
                  "rounded-full transition-opacity",
                  !selected && "opacity-45 hover:opacity-80"
                )}
              >
                <TagChip name={tag.name} color={tag.color}>
                  {selected && <Check className="h-3 w-3" />}
                </TagChip>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
