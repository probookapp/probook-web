import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ACTIVATABLE, activateProps } from "@/components/ui/activate";

/**
 * Stacked row for the admin lists on narrow screens.
 *
 * The dashboard's tables are six to nine columns wide; below `md` they used to
 * be a horizontal scroll and nothing else. The tenants, users, subscriptions
 * and requests pages already hand-rolled a card variant — this is that same
 * shape, factored out so the remaining lists get it without repeating the
 * markup (and so they all look alike).
 *
 * `actions` is usually a `<RowActions>` built from the same list as the table
 * row, so phone and desktop offer the same menu; `onActivate` makes tapping the
 * card open the record, like clicking the row.
 */
export function MobileCard({
  title,
  subtitle,
  badges,
  fields,
  actions,
  onActivate,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  /** Label/value pairs; entries with a nullish value are skipped. */
  fields?: { label: string; value: ReactNode }[];
  actions?: ReactNode;
  /** Opens the record when the card is tapped (not its buttons). */
  onActivate?: () => void;
}) {
  const shown = (fields || []).filter((f) => f.value !== null && f.value !== undefined);

  return (
    <div
      className={cn("p-4 space-y-2", onActivate && ACTIVATABLE, onActivate && "active:bg-(--color-bg-secondary)")}
      {...activateProps<HTMLDivElement>(onActivate)}
    >
      {/* Wraps: a title too long to share its line sends the badges under it,
          rather than being broken into a narrow column beside them. */}
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-gray-100 break-words">{title}</p>
          {subtitle ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 break-words">{subtitle}</p>
          ) : null}
        </div>
        {badges ? <div className="flex shrink-0 flex-wrap items-center gap-2">{badges}</div> : null}
      </div>

      {shown.length > 0 && (
        <dl className="space-y-1 text-sm">
          {shown.map((field) => (
            <div key={field.label} className="flex justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400 shrink-0">{field.label}</dt>
              {/* Three lines at most: a feature offered on forty plans listed
                  every one of them and filled the screen. */}
              <dd
                className="text-gray-900 dark:text-gray-100 text-end break-words line-clamp-3"
                title={typeof field.value === "string" ? field.value : undefined}
              >
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {actions ? <div className="-me-3 -mb-2 flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  );
}

/** Mobile-only container that mirrors the table it stands in for. */
export function MobileCardList({
  isEmpty,
  emptyLabel,
  children,
}: {
  isEmpty: boolean;
  emptyLabel: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
      {isEmpty ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">{emptyLabel}</div>
      ) : (
        children
      )}
    </div>
  );
}
