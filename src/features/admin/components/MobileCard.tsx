import type { ReactNode } from "react";

/**
 * Stacked row for the admin lists on narrow screens.
 *
 * The dashboard's tables are six to nine columns wide; below `md` they used to
 * be a horizontal scroll and nothing else. The tenants, users, subscriptions
 * and requests pages already hand-rolled a card variant — this is that same
 * shape, factored out so the remaining lists get it without repeating the
 * markup (and so they all look alike).
 */
export function MobileCard({
  title,
  subtitle,
  badges,
  fields,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  /** Label/value pairs; entries with a nullish value are skipped. */
  fields?: { label: string; value: ReactNode }[];
  actions?: ReactNode;
}) {
  const shown = (fields || []).filter((f) => f.value !== null && f.value !== undefined);

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
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
              <dd className="text-gray-900 dark:text-gray-100 text-right break-words">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {actions ? <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div> : null}
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
