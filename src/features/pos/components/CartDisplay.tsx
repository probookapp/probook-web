import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Plus, Minus, Tag } from "lucide-react";
import { usePosStore } from "../stores/usePosStore";
import { formatCurrency } from "@/lib/utils";

const formatAmount = formatCurrency;

// Units that support decimal quantities (weight, length, volume)
const DECIMAL_UNITS = new Set(["kg", "m", "sqm", "cbm", "l"]);

function isDecimalUnit(unit: string) {
  return DECIMAL_UNITS.has(unit);
}

function EditableCell({
  value,
  onCommit,
  formatDisplay,
  step,
  min,
  className,
}: {
  value: number;
  onCommit: (val: number) => void;
  formatDisplay: (val: number) => string;
  step?: string;
  min?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed >= 0) {
      onCommit(parsed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step={step}
        min={min}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full bg-(--color-bg-input) border border-primary-500 rounded px-1.5 py-0.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className={`cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors border-b border-dashed border-transparent hover:border-primary-400 ${className ?? ""}`}
    >
      {formatDisplay(value)}
    </button>
  );
}

export function CartDisplay() {
  const { t } = useTranslation(["pos", "products"]);
  const { items, updateQuantity, updateItemPrice, removeItem } = usePosStore();

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-(--color-text-secondary)">
        <div className="text-center">
          <p className="text-lg">{t("emptyCart")}</p>
          <p className="text-sm">{t("scanOrSearch")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-2 sm:p-4">
      <div className="overflow-x-auto">
      <table className="w-full min-w-120">
        <thead className="sticky top-0 bg-(--color-bg-primary)">
          <tr className="text-left text-sm text-(--color-text-secondary) border-b border-(--color-border-primary)">
            <th className="pb-2 font-medium">{t("product")}</th>
            <th className="pb-2 font-medium text-center w-28 sm:w-32">{t("quantity")}</th>
            <th className="pb-2 font-medium text-right w-20 sm:w-24">{t("unitPrice")}</th>
            <th className="pb-2 font-medium text-right w-20 sm:w-24">{t("total")}</th>
            <th className="pb-2 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const decimal = isDecimalUnit(item.unit);
            const qtyStep = decimal ? 0.1 : 1;
            const lineTotal =
              item.quantity *
              item.unitPrice *
              (1 - item.discountPercent / 100) *
              (1 + item.taxRate / 100);

            return (
              <tr key={item.id} className="border-b border-(--color-border-primary) hover:bg-(--color-bg-secondary)/50">
                <td className="py-3">
                  <div>
                    <p className="font-medium">{item.designation}</p>
                    {item.barcode && (
                      <p className="text-xs text-(--color-text-secondary)">
                        {item.barcode}
                      </p>
                    )}
                    {item.priceTier && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {t(`products:pricing.labels.${item.priceTier}`, { defaultValue: item.priceTier })}
                      </p>
                    )}
                    {item.discountPercent > 0 && (
                      <p className="text-xs text-green-600">
                        -{item.discountPercent}%
                      </p>
                    )}
                  </div>
                </td>
                <td className="py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.id, Math.round((item.quantity - qtyStep) * 100) / 100)}
                      className="p-1 rounded hover:bg-(--color-bg-secondary)"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <EditableCell
                      value={item.quantity}
                      onCommit={(val) => updateQuantity(item.id, Math.max(decimal ? 0.01 : 1, decimal ? Math.round(val * 100) / 100 : Math.round(val)))}
                      formatDisplay={(val) => decimal ? val.toFixed(2) : String(val)}
                      step={decimal ? "0.01" : "1"}
                      min={decimal ? "0.01" : "1"}
                      className="w-12 text-center font-medium"
                    />
                    <button
                      onClick={() => updateQuantity(item.id, Math.round((item.quantity + qtyStep) * 100) / 100)}
                      className="p-1 rounded hover:bg-(--color-bg-secondary)"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </td>
                <td className="py-3 text-right">
                  <EditableCell
                    value={item.unitPrice}
                    onCommit={(val) => updateItemPrice(item.id, val)}
                    formatDisplay={(val) => formatAmount(val * (1 + item.taxRate / 100))}
                    step="0.01"
                    min="0"
                  />
                </td>
                <td className="py-3 text-right font-medium">
                  {formatAmount(lineTotal)}
                </td>
                <td className="py-3">
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
