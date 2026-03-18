import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";

interface OpenSessionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (openingFloat: number) => void;
  isLoading: boolean;
}

export function OpenSessionModal({
  open,
  onClose,
  onConfirm,
  isLoading,
}: OpenSessionModalProps) {
  const { t } = useTranslation("pos");
  const currency = useSettingsStore((state) => state.currency);
  const [openingFloat, setOpeningFloat] = useState<string>("0");

  if (!open) return null;

  const handleConfirm = () => {
    const amount = parseFloat(openingFloat) || 0;
    onConfirm(amount);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-(--color-bg-primary) rounded-xl shadow-xl w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-(--color-border-primary)">
          <h2 className="text-xl font-bold">{t("openSession")}</h2>
          <button onClick={onClose} className="p-1 hover:bg-(--color-bg-secondary) rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-(--color-text-secondary) text-sm">
            {t("openingFloatDescription")}
          </p>
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("openingFloat")} ({currency})
            </label>
            <input
              type="number"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              className="w-full px-4 py-3 border border-(--color-border-input) rounded-lg text-2xl text-center font-bold bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="0.00"
              min="0"
              step="0.01"
              autoFocus
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-(--color-border-primary) flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-(--color-border-primary) rounded-lg hover:bg-(--color-bg-secondary) font-medium transition-colors"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-bold disabled:opacity-50 transition-colors"
          >
            {isLoading ? t("loading") : t("open")}
          </button>
        </div>
      </div>
    </div>
  );
}
