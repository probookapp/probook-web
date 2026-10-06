/**
 * The colours a tag may wear.
 *
 * Five keys, not a colour picker. The identity aliases Tailwind's factory
 * scales onto five semantic ramps (src/app/globals.css), and each of those is
 * already measured against its own background in both themes by
 * e2e/dark-mode-contrast.spec.ts. A free hex would escape all of that: a tag
 * the user picked at #ffe08a is invisible on warm paper and the dark theme
 * cannot correct it, because a stored colour has no dark counterpart.
 *
 * The stored value is the key, never the class string — classes are a build
 * artefact of Tailwind and a stored one would rot the first time the palette
 * moved.
 */
export const TAG_COLORS = ["gray", "blue", "green", "amber", "red"] as const;

export type TagColor = (typeof TAG_COLORS)[number];

export const DEFAULT_TAG_COLOR: TagColor = "gray";

/**
 * Tint, text and hairline for each key.
 *
 * Deliberately the same five pairs the status badge uses, so a tag and a state
 * sitting side by side in a list belong to one palette. What separates them is
 * the shape, not the hue: see TagChip.
 */
const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  gray: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  blue: "bg-info-50 text-info-700 border-info-200 dark:bg-info-950 dark:text-info-300 dark:border-info-800",
  green:
    "bg-success-50 text-success-700 border-success-200 dark:bg-success-950 dark:text-success-300 dark:border-success-800",
  amber:
    "bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-950 dark:text-warning-300 dark:border-warning-800",
  red: "bg-danger-50 text-danger-700 border-danger-200 dark:bg-danger-950 dark:text-danger-300 dark:border-danger-800",
};

/** A tag whose stored colour is unknown falls back rather than losing its box. */
export function tagColorClasses(color: string | null | undefined): string {
  return TAG_COLOR_CLASSES[(color ?? "") as TagColor] ?? TAG_COLOR_CLASSES[DEFAULT_TAG_COLOR];
}

/**
 * A tag has to fit in a chip beside a quote number on a 390 px screen, so the
 * ceiling is short on purpose: a label is a word or two, not a sentence.
 */
export const TAG_MAX_LENGTH = 32;

/**
 * Labels are matched on their trimmed, whitespace-collapsed form, so
 * "Chantier Hydra" and "Chantier  Hydra " are one label rather than two. Case
 * is folded at lookup (the routes), not here: what the user typed is what the
 * chip shows.
 */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function isTagColor(value: unknown): value is TagColor {
  return typeof value === "string" && (TAG_COLORS as readonly string[]).includes(value);
}
