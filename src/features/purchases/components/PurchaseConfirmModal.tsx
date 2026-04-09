import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Button, Modal, SearchableSelect } from "@/components/ui";
import {
  usePosRegisters,
  useActiveSession,
} from "@/features/pos/hooks/usePosSession";
import type { PurchaseOrder, ConfirmPurchaseOrderInput } from "@/types";

interface PurchaseConfirmModalProps {
  open: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrder | null;
  onConfirm: (input: ConfirmPurchaseOrderInput) => void;
  isLoading?: boolean;
}

export function PurchaseConfirmModal({
  open,
  onClose,
  purchaseOrder,
  onConfirm,
  isLoading,
}: PurchaseConfirmModalProps) {
  const { t } = useTranslation("purchases");
  const { t: tCommon } = useTranslation("common");

  const [paidFromRegister, setPaidFromRegister] = useState(false);
  const [selectedRegisterId, setSelectedRegisterId] = useState("");

  const { data: registers } = usePosRegisters();
  const { data: activeSession } = useActiveSession(
    paidFromRegister && selectedRegisterId ? selectedRegisterId : undefined
  );

  const registerOptions = (registers ?? [])
    .filter((r) => r.is_active)
    .map((r) => ({
      value: r.id,
      label: r.name + (r.location ? ` (${r.location})` : ""),
    }));

  const handleConfirm = () => {
    if (!purchaseOrder) return;

    const input: ConfirmPurchaseOrderInput = {
      paid_from_register: paidFromRegister,
      register_id: paidFromRegister && selectedRegisterId ? selectedRegisterId : null,
      session_id:
        paidFromRegister && activeSession ? activeSession.id : null,
    };

    onConfirm(input);
  };

  const handleClose = () => {
    setPaidFromRegister(false);
    setSelectedRegisterId("");
    onClose();
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title={t("confirmModal.title")}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-gray-600 dark:text-gray-400">
          {t("confirmModal.description")}
        </p>

        {purchaseOrder && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">
                {t("fields.orderNumber")}
              </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {purchaseOrder.order_number}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">
                {t("fields.supplier")}
              </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {purchaseOrder.supplier?.name ?? "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">
                {t("fields.total")}
              </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: "DZD",
                }).format(purchaseOrder.total)}
              </span>
            </div>
          </div>
        )}

        {/* Pay from register toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={paidFromRegister}
            onChange={(e) => {
              setPaidFromRegister(e.target.checked);
              if (!e.target.checked) {
                setSelectedRegisterId("");
              }
            }}
            className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("confirmModal.payFromRegister")}
          </span>
        </label>

        {paidFromRegister && (
          <div className="space-y-3 pl-7">
            <SearchableSelect
              label={t("confirmModal.selectRegister")}
              options={registerOptions}
              value={selectedRegisterId}
              onChange={setSelectedRegisterId}
              placeholder={t("confirmModal.selectRegisterPlaceholder")}
            />

            {selectedRegisterId && activeSession && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm">
                <p className="text-green-800 dark:text-green-300 font-medium">
                  {t("confirmModal.activeSession")}
                </p>
                <p className="text-green-600 dark:text-green-400 text-xs mt-1">
                  {t("confirmModal.openedAt")}: {new Date(activeSession.opened_at).toLocaleString()}
                </p>
              </div>
            )}

            {selectedRegisterId && !activeSession && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-yellow-800 dark:text-yellow-300">
                  {t("confirmModal.noActiveSession")}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            {tCommon("buttons.cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            isLoading={isLoading}
            disabled={paidFromRegister && (!selectedRegisterId || !activeSession)}
          >
            {t("confirmModal.confirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
