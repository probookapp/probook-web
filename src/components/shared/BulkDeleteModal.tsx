import { useTranslation } from "react-i18next";
import { Button, Modal } from "@/components/ui";

interface BulkDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  count: number;
  isLoading?: boolean;
}

export function BulkDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  count,
  isLoading,
}: BulkDeleteModalProps) {
  const { t } = useTranslation("common");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("bulk.confirmDeleteTitle")}
      size="sm"
    >
      <p className="text-(--color-text-secondary) mb-6">
        {t("bulk.confirmDeleteMessage", { count })}
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          {t("buttons.cancel")}
        </Button>
        <Button variant="danger" onClick={onConfirm} isLoading={isLoading}>
          {t("bulk.deleteCount", { count })}
        </Button>
      </div>
    </Modal>
  );
}
