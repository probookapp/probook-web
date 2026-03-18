import { useTranslation } from "react-i18next";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { ReactNode } from "react";

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

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t("bulk.selectedCount", { count: selectedCount })}
        </span>
        <div className="flex items-center gap-2">
          {children}
          <Button
            variant="danger"
            size="sm"
            onClick={onDelete}
            isLoading={isDeleting}
            disabled={disabled}
            disabledReason={disabledReason}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t("bulk.deleteSelected")}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="h-4 w-4 mr-1" />
            {t("bulk.clearSelection")}
          </Button>
        </div>
      </div>
    </div>
  );
}
