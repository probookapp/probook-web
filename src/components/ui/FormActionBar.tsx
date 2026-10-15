import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormActionBarProps {
  children: ReactNode;
  /** Shown before the buttons from sm up: a save confirmation, an unsaved-changes hint. */
  status?: ReactNode;
  className?: string;
}

/**
 * The Cancel / Save row of a long form, pinned to the bottom of the page's
 * scroll area at every width. A quote, an invoice or the settings run several
 * screens long; with the button at the very end, a user who forgot to scroll
 * reached for the Back button at the top instead and lost the document.
 *
 * It bleeds through the page padding of Layout (p-4 sm:p-6 lg:p-8) so its rule
 * spans the content column, and wears the page background so the page padding
 * below it reads as part of the bar.
 */
export function FormActionBar({ children, status, className }: FormActionBarProps) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 flex items-center gap-3",
        "border-t border-gray-200 bg-gray-100 px-4 py-3 sm:px-6 lg:px-8 dark:border-gray-800 dark:bg-gray-900",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className
      )}
    >
      {status && <div className="hidden min-w-0 flex-1 text-sm sm:block">{status}</div>}
      <div className={cn("flex flex-1 gap-3 sm:justify-end", status && "sm:flex-none")}>{children}</div>
    </div>
  );
}
