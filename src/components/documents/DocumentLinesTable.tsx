"use client";

import { useTranslation } from "react-i18next";
import { PackageX } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableNumericCell, TableRow } from "@/components/ui";
import { bundleRoles } from "@/lib/bundles";
import { cn, formatCurrency } from "@/lib/utils";

/** The subset of a saved line this table reads. Kept loose: four documents share it. */
export interface ReadonlyDocumentLine {
  id: string;
  description: string;
  quantity: number;
  unit_price?: number | null;
  tax_rate?: number | null;
  total?: number | null;
  unit?: string | null;
  is_bundle_header?: boolean | null;
  bundle_key?: string | null;
}

interface DocumentLinesTableProps {
  lines: readonly ReadonlyDocumentLine[];
  /**
   * "priced": description, quantity, unit price, VAT, total — invoices, quotes,
   * credit notes. "delivery": description, quantity, unit — a delivery note
   * says what leaves, not what it costs.
   */
  variant: "priced" | "delivery";
  /** Column headings, from the document's own namespace. */
  labels: { description: string; quantity: string; unitPrice?: string; total?: string; unit?: string };
  /**
   * A warning per line (same index as `lines`), or nothing. A line with one is
   * drawn in red with the message under its description — the quote's "not
   * enough in stock".
   */
  alerts?: readonly (string | null | undefined)[];
}

const ALERT_TEXT = "font-medium text-red-700 dark:text-red-300";
const ALERT_ROW = "bg-red-50 dark:bg-red-900/20 hover:bg-red-50 dark:hover:bg-red-900/20";

function Alert({ message }: { message: string }) {
  return (
    <span className="mt-0.5 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
      <PackageX className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </span>
  );
}

/**
 * A saved document's lines, read-only: cards on a phone, a table from md up.
 *
 * One component for the four view pages, which each carried their own copy of
 * the same markup — so a change to how a line reads (a pack's components, a
 * stock warning) used to be four changes, and drifted when one was forgotten.
 *
 * Pack components (see bundleRoles) sit indented under their pack: the value is
 * on the pack's own line, so they show what and how many, and the rate each is
 * taxed at. A pack whose components carry different rates says so instead of
 * showing one.
 */
export function DocumentLinesTable({ lines, variant, labels, alerts }: DocumentLinesTableProps) {
  const { t } = useTranslation("common");
  const roles = bundleRoles(lines);
  const priced = variant === "priced";
  const vatLabel = t("labels.vat");

  return (
    <>
      {/* Phone */}
      <div className={priced ? "md:hidden space-y-3" : "md:hidden divide-y divide-(--color-border-primary)"}>
        {lines.map((line, index) => {
          const alert = alerts?.[index];
          const child = roles[index].role === "child";

          if (!priced) {
            return (
              <div key={line.id} className={child ? "ps-8 pe-4 py-2" : "px-4 py-3"}>
                <p className={child ? "text-xs text-(--color-text-secondary)" : "text-sm font-medium"}>
                  {line.description}
                </p>
                <div className="flex items-center gap-3 mt-1 text-sm text-(--color-text-secondary)">
                  <span>{line.quantity}</span>
                  <span>{line.unit || "-"}</span>
                </div>
              </div>
            );
          }

          if (child) {
            return (
              <p
                key={line.id}
                className={cn(
                  "-mt-2 ps-4 text-xs",
                  alert ? "text-red-600 dark:text-red-400" : "text-(--color-text-secondary)"
                )}
              >
                {line.quantity} × {line.description} · {line.tax_rate}% {vatLabel}
                {alert && <> · {alert}</>}
              </p>
            );
          }

          return (
            <div
              key={line.id}
              className={cn(
                "border rounded-lg p-3",
                alert ? undefined : "border-(--color-border-primary)",
                alert ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20" : "bg-(--color-bg-secondary)"
              )}
            >
              <p className={cn("text-sm font-medium", alert && "text-red-700 dark:text-red-300")}>{line.description}</p>
              {alert && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                  <PackageX className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {alert}
                </p>
              )}
              <div className="flex items-center justify-between mt-1.5 text-sm text-(--color-text-secondary)">
                <span>{line.quantity} × {formatCurrency(line.unit_price ?? 0)} HT</span>
                <span>
                  {roles[index].mixedRates ? t("documentLines.packMixedVat") : `${line.tax_rate}% ${vatLabel}`}
                </span>
              </div>
              <div className="flex justify-end mt-1">
                <span className="text-sm font-medium">{formatCurrency(line.total ?? 0)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* md and up */}
      <div
        className={cn(
          "hidden md:block",
          priced && "border border-(--color-border-primary) rounded-lg overflow-hidden"
        )}
      >
        <Table className={priced ? "min-w-125" : "min-w-80"}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-3">{labels.description}</TableHead>
              <TableHead className={cn("px-3", priced ? "w-16 text-center" : "w-20 text-end")}>{labels.quantity}</TableHead>
              {priced ? (
                <>
                  <TableHead className="px-3 text-end whitespace-nowrap">{labels.unitPrice}</TableHead>
                  <TableHead className="px-3 w-16 text-center">{vatLabel}</TableHead>
                  <TableHead className="px-3 text-end whitespace-nowrap">{labels.total}</TableHead>
                </>
              ) : (
                <TableHead className="px-3 w-20">{labels.unit}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => {
              const alert = alerts?.[index];
              const { role, mixedRates } = roles[index];
              const child = role === "child";
              const cell = child ? "px-3 py-1.5 text-xs" : "px-3 py-2";

              return (
                <TableRow
                  key={line.id}
                  className={cn(
                    "hover:bg-transparent",
                    child && !alert && "text-(--color-text-secondary)",
                    alert && ALERT_ROW
                  )}
                >
                  <TableCell className={cn(cell, child && "ps-8")}>
                    <span className={alert ? ALERT_TEXT : undefined}>{line.description}</span>
                    {alert && <Alert message={alert} />}
                  </TableCell>
                  {priced ? (
                    <>
                      <TableCell className={cn(cell, "text-center tabular-nums", alert && !child && "font-semibold text-red-700 dark:text-red-300")}>
                        {line.quantity}
                      </TableCell>
                      {child ? (
                        <TableCell className={cell} />
                      ) : (
                        <TableNumericCell className={cell}>{formatCurrency(line.unit_price ?? 0)}</TableNumericCell>
                      )}
                      <TableCell className={cn(cell, "text-center tabular-nums")}>
                        {!child && mixedRates ? t("documentLines.packMixedVatShort") : `${line.tax_rate}%`}
                      </TableCell>
                      {child ? (
                        <TableCell className={cell} />
                      ) : (
                        <TableNumericCell className={cn(cell, "font-medium")}>{formatCurrency(line.total ?? 0)}</TableNumericCell>
                      )}
                    </>
                  ) : (
                    <>
                      <TableNumericCell className={cell}>{line.quantity}</TableNumericCell>
                      <TableCell className={cell}>{line.unit || "-"}</TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
