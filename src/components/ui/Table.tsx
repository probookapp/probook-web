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
 * For money and quantities: right-aligned and monospaced, so decimal points
 * stack and a wrong order of magnitude is visible without reading the digits.
 */
export function TableNumericCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-4 py-3 align-middle text-end font-mono tabular-nums", className)}
      {...props}
    />
  );
}
