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
        className="w-full bg-(--color-bg-input) border border-primary-500 rounded px-1.5 py-0.5 text-sm text-end font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-primary-500"
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

  const lineTotalOf = (item: (typeof items)[number]) =>
    item.quantity *
    item.unitPrice *
    (1 - item.discountPercent / 100) *
    (1 + item.taxRate / 100);

  const stepOf = (unit: string) => (isDecimalUnit(unit) ? 0.1 : 1);

  const commitQuantity = (item: (typeof items)[number], val: number) => {
    const decimal = isDecimalUnit(item.unit);
    updateQuantity(item.id, Math.max(decimal ? 0.01 : 1, decimal ? Math.round(val * 100) / 100 : Math.round(val)));
  };

  // A cashier taps these all day, often on a tablet: 40 px, whatever the width.
  const stepButton = "p-3 rounded-md hover:bg-(--color-bg-secondary)";

  const details = (item: (typeof items)[number]) => (
    <>
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
        <p className="text-xs text-green-600 dark:text-green-400">
          -{item.discountPercent}%
        </p>
      )}
    </>
  );

  const quantityStepper = (item: (typeof items)[number]) => {
    const decimal = isDecimalUnit(item.unit);
    const qtyStep = stepOf(item.unit);
    return (
      <div className="flex items-center justify-center gap-1">
        <button
          onClick={() => updateQuantity(item.id, Math.round((item.quantity - qtyStep) * 100) / 100)}
          className={stepButton}
          aria-label={t("decreaseQuantity")}
          title={t("decreaseQuantity")}
        >
          <Minus className="h-4 w-4" />
        </button>
        <EditableCell
          value={item.quantity}
          onCommit={(val) => commitQuantity(item, val)}
          formatDisplay={(val) => decimal ? val.toFixed(2) : String(val)}
          step={decimal ? "0.01" : "1"}
          min={decimal ? "0.01" : "1"}
          className="w-12 py-2 text-center font-medium font-mono tabular-nums"
        />
        <button
          onClick={() => updateQuantity(item.id, Math.round((item.quantity + qtyStep) * 100) / 100)}
          className={stepButton}
          aria-label={t("increaseQuantity")}
          title={t("increaseQuantity")}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const removeButton = (item: (typeof items)[number]) => (
    <button
      onClick={() => removeItem(item.id)}
      className="p-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
      aria-label={t("removeItem")}
      title={t("removeItem")}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );

  return (
    <div className="flex-1 overflow-auto p-2 sm:p-4">
      {/* Phone: one block per line. Five columns do not fit in 360 px, and a
          basket that scrolls sideways hides the total or the delete button. */}
      <ul className="sm:hidden divide-y divide-(--color-border-primary)">
        {items.map((item) => (
          <li key={item.id} className="py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 pt-2">
                <p className="font-medium wrap-break-word">{item.designation}</p>
                {details(item)}
              </div>
              <div className="shrink-0 -me-1">{removeButton(item)}</div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="-ms-2">{quantityStepper(item)}</div>
              <div className="min-w-0 text-end">
                <EditableCell
                  value={item.unitPrice}
                  onCommit={(val) => updateItemPrice(item.id, val)}
                  formatDisplay={(val) => formatAmount(val * (1 + item.taxRate / 100))}
                  step="0.01"
                  min="0"
                  className="text-xs text-(--color-text-secondary) font-mono tabular-nums whitespace-nowrap"
                />
                <p className="font-medium font-mono tabular-nums whitespace-nowrap">
                  {formatAmount(lineTotalOf(item))}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden sm:block overflow-x-auto">
      {/* The money columns size to their content: a fixed w-24 was narrower
          than a dinar amount, so the price and the line total ran into each
          other with no gap at all. */}
      <table className="w-full min-w-140">
        <thead className="sticky top-0 bg-(--color-bg-primary)">
          <tr className="text-start text-sm text-(--color-text-secondary) border-b border-(--color-border-primary)">
            <th className="pb-2 font-medium text-start">{t("product")}</th>
            <th className="pb-2 font-medium text-center w-36">{t("quantity")}</th>
            <th className="pb-2 ps-4 font-medium text-end whitespace-nowrap">{t("unitPrice")}</th>
            <th className="pb-2 ps-4 font-medium text-end whitespace-nowrap">{t("total")}</th>
            <th className="pb-2 w-12"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
              <tr key={item.id} className="border-b border-(--color-border-primary) hover:bg-(--color-bg-secondary)/50">
                <td className="py-2">
                  <div>
                    <p className="font-medium">{item.designation}</p>
                    {details(item)}
                  </div>
                </td>
                <td className="py-2">
                  {quantityStepper(item)}
                </td>
                <td className="py-2 ps-4 text-end">
                  <EditableCell
                    value={item.unitPrice}
                    onCommit={(val) => updateItemPrice(item.id, val)}
                    formatDisplay={(val) => formatAmount(val * (1 + item.taxRate / 100))}
                    step="0.01"
                    min="0"
                    className="font-mono tabular-nums whitespace-nowrap"
                  />
                </td>
                <td className="py-2 ps-4 text-end font-medium font-mono tabular-nums whitespace-nowrap">
                  {formatAmount(lineTotalOf(item))}
                </td>
                <td className="py-2 text-end">
                  {removeButton(item)}
                </td>
              </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
