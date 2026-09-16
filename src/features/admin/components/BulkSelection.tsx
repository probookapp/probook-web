import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Row selection for the admin queues.
 *
 * Approving fifty requests or settling a month of invoices one modal at a time
 * was the dashboard's most tedious job; these are the pieces both queues share.
 */
export function useRowSelection() {
  const [selected, setSelected] = useState<string[]>([]);

  return {
    selected,
    isSelected: (id: string) => selected.includes(id),
    toggle: (id: string) =>
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    /** Select every selectable row, or clear when they are all selected already. */
    toggleAll: (ids: string[]) =>
      setSelected((prev) => (ids.length > 0 && prev.length === ids.length ? [] : ids)),
    clear: () => setSelected([]),
  };
}

/** Checkbox for a selectable row. */
export function RowCheckbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="h-4 w-4 rounded border-gray-300 text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
    />
  );
}

/** Action bar that appears once at least one row is selected. */
export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("admin");
  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-primary-50 dark:bg-primary-900/20 px-4 py-3">
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {t("bulk.selected", { count })}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Button variant="ghost" size="sm" onClick={onClear} className="ms-auto">
        <X className="h-4 w-4 me-1" />
        {t("bulk.clear")}
      </Button>
    </div>
  );
}

/**
 * Apply a mutation to every selected row, one at a time, and report the tally.
 *
 * Sequential on purpose: these hit approval and payment endpoints that each
 * open a transaction, and a failure partway through must not stop the rest.
 */
export async function runBulk(
  ids: string[],
  action: (id: string) => Promise<unknown>
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await action(id);
      ok++;
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}
