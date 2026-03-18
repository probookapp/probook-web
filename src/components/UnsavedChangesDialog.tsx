import { useTranslation } from "react-i18next";
import { Modal, Button } from "@/components/ui";

interface UnsavedChangesDialogProps {
  isBlocked: boolean;
  onProceed: () => void;
  onReset: () => void;
}

export function UnsavedChangesDialog({ isBlocked, onProceed, onReset }: UnsavedChangesDialogProps) {
  const { t } = useTranslation("common");

  if (!isBlocked) return null;

  return (
    <Modal
      isOpen
      onClose={onReset}
      title={t("unsavedChanges.title")}
      size="sm"
    >
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {t("unsavedChanges.message")}
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" size="sm" onClick={onReset}>
          {t("unsavedChanges.stay")}
        </Button>
        <Button
          size="sm"
          onClick={onProceed}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {t("unsavedChanges.leave")}
        </Button>
      </div>
    </Modal>
  );
}
