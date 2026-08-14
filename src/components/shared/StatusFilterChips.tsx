import { ALL_STATUSES } from "@/lib/document-status";

export interface StatusFilterOption {
  /** A document state, or ALL_STATUSES for the unfiltered view. */
  key: string;
  label: string;
}

interface Props {
  options: StatusFilterOption[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the group — each list says what it is filtering. */
  label: string;
}

/**
 * The row of state chips above a document list.
 *
 * Purchases had one and quotes, invoices and delivery notes did not, which made
 * the same question ("what is still outstanding?") answerable in one module and
 * not the others. One component so they cannot drift apart again.
 */
export function StatusFilterChips({ options, value, onChange, label }: Props) {
  return (
    <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label={label}>
      {options.map((option) => {
        const active = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            aria-pressed={active}
            // Squared and outlined rather than a filled capsule: these are a
            // row of buttons, and they should read like the buttons elsewhere
            // on the page instead of like a second, rounder vocabulary.
            className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
              active
                ? "bg-primary-600 border-primary-600 text-white"
                : "bg-(--color-bg-primary) border-(--color-border-secondary) text-(--color-text-secondary) hover:bg-(--color-bg-tertiary) hover:text-(--color-text-primary)"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** What a list sends to the API: undefined for the unfiltered view. */
export function statusQuery(value: string): string | undefined {
  return value === ALL_STATUSES ? undefined : value;
}
