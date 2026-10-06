import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TAG_COLORS, tagColorClasses, type TagColor } from "@/lib/tag-colors";

interface Props {
  value: string;
  onChange: (color: TagColor) => void;
  /** Distinguishes the swatch group when several are on screen at once. */
  idPrefix: string;
}

/**
 * The five colours a label may wear.
 *
 * Swatches rather than a colour input: the palette is fixed because each hue
 * owes a dark-theme counterpart (src/lib/tag-colors.ts), and a native picker
 * would promise sixteen million colours of which most are unreadable on one of
 * the two backgrounds.
 */
export function TagColorChoice({ value, onChange, idPrefix }: Props) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label={t("tags.color")}>
      {TAG_COLORS.map((color) => {
        const selected = value === color;
        return (
          <button
            key={`${idPrefix}-${color}`}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(`tags.colors.${color}`)}
            title={t(`tags.colors.${color}`)}
            onClick={() => onChange(color)}
            className={cn(
              "h-6 w-6 rounded-full border transition-shadow",
              tagColorClasses(color),
              selected && "ring-2 ring-primary-600 ring-offset-1 ring-offset-(--color-bg-primary)"
            )}
          />
        );
      })}
    </div>
  );
}
