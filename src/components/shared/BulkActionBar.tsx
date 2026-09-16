import { useTranslation } from "react-i18next";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface BulkActionBarProps {
  selectedCount: number;
  onDelete: () => void;
  onClear: () => void;
  isDeleting?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  children?: ReactNode;
}

export function BulkActionBar({
  selectedCount,
  onDelete,
  onClear,
  isDeleting,
  disabled,
  disabledReason,
  children,
}: BulkActionBarProps) {
  const { t } = useTranslation("common");
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);
  const visible = selectedCount > 0;

  // The bar floats over the bottom of the page, so it used to sit on the last
  // rows of the very list it acts on — on a phone, the row just ticked. The
  // spacer below takes the bar's height in the page's own flow (the lists
  // render this component after their content), so the page can always scroll
  // those rows clear of it. Measured, because the bar wraps to two or three
  // lines on a narrow screen.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!visible || !bar) return;
    const observer = new ResizeObserver(() => setBarHeight(bar.offsetHeight));
    observer.observe(bar);
    return () => observer.disconnect();
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <div aria-hidden="true" style={{ height: barHeight }} />
      {/* From lg up it starts at the rail's edge (w-64), so its content lines
          up with the page above it instead of centring on the whole window. */}
      <div
        ref={barRef}
        className="fixed bottom-0 inset-x-0 lg:start-64 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg pb-[env(safe-area-inset-bottom)]"
      >
        <div className="px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("bulk.selectedCount", { count: selectedCount })}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {children}
            <Button
              variant="danger"
              size="sm"
              onClick={onDelete}
              isLoading={isDeleting}
              disabled={disabled}
              disabledReason={disabledReason}
            >
              <Trash2 className="h-4 w-4" />
              {t("bulk.deleteSelected")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X className="h-4 w-4" />
              {t("bulk.clearSelection")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
