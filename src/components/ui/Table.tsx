import { type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A ledger, not a grid. The header is a quiet band of small caps, rows are
 * separated by a hairline rather than boxed, and figures are set in the mono
 * face so a column of money reads as a column.
 */

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  // The scroll lives here so a wide table never makes the page itself slide.
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-(--color-border-primary) transition-colors",
        "hover:bg-(--color-bg-secondary)",
        className
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-10 px-4 text-start align-middle",
        "text-xs font-semibold uppercase tracking-wider text-(--color-text-tertiary)",
        "bg-(--color-bg-secondary)",
        className
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}

/**
 * How a figure is set, wherever it appears.
 *
 * `text-end` and not `text-end`: in Arabic the row runs the other way, and a
 * physically-right-aligned column of numbers lands on the wrong side of its own
 * heading. `tabular-nums` keeps the decimal points stacked, so a wrong order of
 * magnitude is visible without reading the digits. `whitespace-nowrap` stops an
 * amount breaking across two lines mid-number.
 *
 * Exported because not every table is built from these primitives — the
 * document line tables and the till are laid out by hand and still owe the
 * reader the same figures.
 */
export const NUMERIC_CELL = "text-end font-mono tabular-nums whitespace-nowrap";

/** For money and quantities, in tables built from these primitives. */
export function TableNumericCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle", NUMERIC_CELL, className)} {...props} />;
}
