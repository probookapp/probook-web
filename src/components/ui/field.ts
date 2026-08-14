import { cn } from "@/lib/utils";

/**
 * One recipe for every field.
 *
 * Input, Select, Textarea, DateInput and SearchableSelect each carried their
 * own copy of these classes, and the copies had already drifted — different
 * radii, different disabled greys, a shadow on some and not others. A control
 * that looks almost like its neighbour is worse than one that looks nothing
 * like it: the eye reads the near-miss as a defect.
 */

/** Matches Button's `md` height, so a field and a button sit on one line. */
export const FIELD_HEIGHT = "h-9";

export const fieldLabel =
  "block text-sm font-medium text-(--color-text-secondary) mb-1.5";

export const fieldError = "mt-1.5 text-sm text-danger-600 dark:text-danger-400";

export function fieldBase(hasError?: boolean, className?: string) {
  return cn(
    "w-full px-3 rounded-md border text-sm",
    "bg-(--color-bg-input) text-(--color-text-primary)",
    "transition-[border-color,box-shadow] duration-150",
    "placeholder:text-(--color-text-tertiary)",
    // The ring is drawn with a shadow rather than an outline so it hugs the
    // rounded corner instead of boxing it.
    "focus:outline-none focus:border-primary-500 focus:shadow-[0_0_0_3px_var(--color-primary-100)]",
    "dark:focus:shadow-[0_0_0_3px_var(--color-primary-900)]",
    "disabled:bg-(--color-bg-tertiary) disabled:text-(--color-text-tertiary) disabled:cursor-not-allowed",
    hasError
      ? "border-danger-500 focus:border-danger-500 focus:shadow-[0_0_0_3px_var(--color-danger-100)] dark:focus:shadow-[0_0_0_3px_var(--color-danger-900)]"
      : "border-(--color-border-input)",
    className
  );
}
