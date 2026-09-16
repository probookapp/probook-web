"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ChevronRight, Layers } from "lucide-react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { Button, Input, Modal, SearchableSelect } from "@/components/ui";
import { calculateLineTotals } from "@/lib/document-totals";
import { formatCurrency } from "@/lib/utils";

/**
 * The line editor for phones.
 *
 * The wide-screen editor is a grid: every field of every line on screen at once.
 * Narrowed to 390px it becomes a column four rows deep — 380px per line, two
 * lines per screen — so re-reading a six-line quote in front of a customer takes
 * three screenfuls, and correcting a quantity means hitting a 36px target under
 * the phone's own keyboard.
 *
 * This inverts it: the document reads as a list of folded lines — quantity,
 * description, amount — and editing happens one line at a time in a sheet with
 * targets sized for a thumb. The fields are the same fields; only the way in is
 * different.
 *
 * Numeric entry uses inputMode rather than a keypad of our own: the phone then
 * offers its own numeric keyboard, which already handles paste, decimal commas
 * and assistive technology. A hand-rolled keypad would have to earn all three
 * back, and would be worse until it did.
 */

/** The subset of a line this editor reads. Kept loose: three documents share it. */
export interface EditableLine {
  product_id?: string | null;
  variant_id?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  tax_rate?: number | string | null;
  discount_percent?: number | string | null;
  group_name?: string | null;
  is_subtotal_line?: boolean | null;
}

export interface DocumentLinesMobileProps {
  /** Translation namespace of the host document: quotes, invoices, delivery. */
  ns: string;
  /** Stable keys from useFieldArray. */
  fields: { id: string }[];
  lines: EditableLine[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one editor, three form shapes
  register: UseFormRegister<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idem
  errors?: FieldErrors<any>;
  productOptions: { value: string; label: string }[];
  onSelectProduct: (index: number, productId: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  /** Over-committed stock for this line, already worded. */
  stockError?: (index: number) => string | null;
  /** The variants a product offers; empty for a product without any. */
  variantOptions?: (productId: string) => { value: string; label: string }[];
  onSelectVariant?: (index: number, variantId: string) => void;
  variantLabel?: string;
  variantPlaceholder?: string;
  /** A product with variants whose variant is still to be chosen, already worded. */
  variantError?: (index: number) => string | null;
  /** Lines can carry a discount on quotes and invoices, not on delivery notes. */
  withDiscount?: boolean;
  /** Delivery notes state quantities only — no money. */
  withPricing?: boolean;
}

const asNumber = (value: unknown): number => parseFloat(String(value ?? "")) || 0;

export function DocumentLinesMobile({
  ns,
  fields,
  lines,
  register,
  errors,
  productOptions,
  onSelectProduct,
  onAdd,
  onRemove,
  stockError,
  variantOptions,
  onSelectVariant,
  variantLabel,
  variantPlaceholder,
  variantError,
  withDiscount = true,
  withPricing = true,
}: DocumentLinesMobileProps) {
  const { t } = useTranslation([ns, "common"]);
  const [editing, setEditing] = useState<number | null>(null);

  const totalOf = (line: EditableLine | undefined) =>
    calculateLineTotals({
      quantity: asNumber(line?.quantity),
      unit_price: asNumber(line?.unit_price),
      tax_rate: asNumber(line?.tax_rate),
      discount_percent: asNumber(line?.discount_percent),
      is_subtotal_line: line?.is_subtotal_line,
    }).total;

  const documentTotal = lines.reduce(
    (sum, line) => (line?.is_subtotal_line ? sum : sum + totalOf(line)),
    0
  );

  const openLine = editing === null ? undefined : lines[editing];
  const openError = editing === null ? null : stockError?.(editing) ?? null;
  const openVariants =
    openLine?.product_id && variantOptions ? variantOptions(openLine.product_id) : [];

  /** A new line opens straight into the sheet: adding then hunting for it is two gestures. */
  const addAndOpen = () => {
    onAdd();
    setEditing(fields.length);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* What the document is worth, before the lines rather than after them:
          on a phone the totals card is several screens down. */}
      <div className="flex items-baseline justify-between px-1">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {t(`${ns}:lines.count`, { count: fields.length })}
        </span>
        {withPricing && (
          <span className="text-base font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
            {formatCurrency(documentTotal)}
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {fields.map((field, index) => {
          const line = lines[index];
          const isSubtotal = !!line?.is_subtotal_line;
          const problem = variantError?.(index) ?? stockError?.(index) ?? null;
          const description =
            line?.description?.trim() || t(`${ns}:lines.untitled`, { defaultValue: "Sans titre" });

          return (
            <li key={field.id}>
              <button
                type="button"
                onClick={() => setEditing(index)}
                // min-h-13 (52px): 44px is the floor for a touch target, and this row is
                // tapped constantly. The extra eight pixels cost one line of the six.
                className={`w-full text-start rounded-lg border px-3 py-3 min-h-13 flex items-center gap-3 transition-colors ${
                  problem
                    ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
                    : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                {isSubtotal ? (
                  <Layers className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                ) : (
                  <span className="shrink-0 text-sm font-semibold text-primary-600 dark:text-primary-400 tabular-nums">
                    {asNumber(line?.quantity) || 1} ×
                  </span>
                )}

                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                    {isSubtotal ? t(`${ns}:lines.subtotalOnly`) : description}
                  </span>
                  {problem && (
                    <span className="block truncate text-xs text-red-600 dark:text-red-400">
                      {problem}
                    </span>
                  )}
                  {!problem && line?.group_name && (
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {line.group_name}
                    </span>
                  )}
                </span>

                {withPricing && !isSubtotal && (
                  <span className="shrink-0 text-sm font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                    {formatCurrency(totalOf(line))}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
              </button>
            </li>
          );
        })}
      </ul>

      <Button type="button" variant="secondary" onClick={addAndOpen} className="w-full">
        <Plus className="h-4 w-4 me-2" />
        {t(`${ns}:lines.addLine`)}
      </Button>

      {/* ─── the editing sheet ─── */}
      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={t(`${ns}:lines.lineNumber`, { number: (editing ?? 0) + 1 })}
        size="md"
      >
        {editing !== null && (
          <div className="flex flex-col gap-4">
            <SearchableSelect
              label={t(`${ns}:lines.product`)}
              options={productOptions}
              value={openLine?.product_id || ""}
              onChange={(value) => onSelectProduct(editing, value)}
              placeholder={`${t(`${ns}:lines.product`)} (${t("common:labels.optional")})`}
            />

            {openVariants.length > 0 && onSelectVariant && (
              <SearchableSelect
                label={`${variantLabel} *`}
                options={openVariants}
                value={openLine?.variant_id || ""}
                onChange={(value) => onSelectVariant(editing, value)}
                placeholder={variantPlaceholder}
                error={variantError?.(editing) ?? undefined}
              />
            )}

            <Input
              label={`${t(`${ns}:lines.description`)} *`}
              {...register(`lines.${editing}.description`)}
              error={
                (errors?.lines as Record<number, { description?: { message?: string } }> | undefined)?.[
                  editing
                ]?.description?.message
              }
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label={`${t(`${ns}:lines.quantity`)} *`}
                type="number"
                step="0.01"
                // The phone's own numeric keyboard: it already knows about paste,
                // decimal commas and screen readers.
                inputMode="decimal"
                className="h-12 text-lg"
                {...register(`lines.${editing}.quantity`)}
                error={openError || undefined}
              />
              {withPricing && (
                <Input
                  label={`${t(`${ns}:lines.unitPriceHt`)} *`}
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  className="h-12 text-lg"
                  {...register(`lines.${editing}.unit_price`)}
                />
              )}
            </div>

            {withPricing && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t(`${ns}:lines.vatRate`)}
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  className="h-12 text-lg"
                  {...register(`lines.${editing}.tax_rate`)}
                />
                {withDiscount && (
                  <Input
                    label={t(`${ns}:lines.discountPercent`)}
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    className="h-12 text-lg"
                    {...register(`lines.${editing}.discount_percent`)}
                  />
                )}
              </div>
            )}

            <Input
              label={t(`${ns}:lines.groupPlaceholder`)}
              placeholder={t(`${ns}:lines.groupPlaceholder`)}
              {...register(`lines.${editing}.group_name`)}
            />

            {withPricing && (
              <div className="flex items-baseline justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t(`${ns}:lines.totalTtc`)}
                </span>
                <span className="text-xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                  {formatCurrency(totalOf(openLine))}
                </span>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => {
                    const index = editing;
                    setEditing(null);
                    onRemove(index);
                  }}
                >
                  <Trash2 className="h-4 w-4 me-2" />
                  {t("common:buttons.delete")}
                </Button>
              )}
              <Button type="button" className="flex-1" onClick={() => setEditing(null)}>
                {t(`${ns}:lines.doneLine`)}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
