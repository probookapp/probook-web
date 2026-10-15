"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ACTIVATABLE, activateProps } from "./activate";

interface ListCardProps {
  /** What a person recognises the record by — the client, the product, the supplier. */
  title: ReactNode;
  /** Beside the title: the status badge. */
  badge?: ReactNode;
  /**
   * The quiet line under the title: reference number, dates. A document number
   * is something to quote on the phone, not to scan a list by, so it goes here
   * in small grey type rather than leading the card.
   */
  meta?: ReactNode;
  /** The figure, on the last line beside the actions — total, balance, amount. */
  amount?: ReactNode;
  /** Anything else, at the start of the last line: labels, a link. */
  children?: ReactNode;
  /** Selection checkbox, before everything. */
  leading?: ReactNode;
  /** Usually <RowActions>: one primary icon and "⋯". */
  actions?: ReactNode;
  /** Opens the record when the card is tapped (not its buttons). */
  onActivate?: () => void;
  className?: string;
}

/**
 * One record of a list, on a phone.
 *
 * The phone counterpart of a table row: the name first and largest, the figure
 * on the right where the eye lands, the reference small underneath, and the
 * actions folded into a primary icon plus "⋯" instead of a row of six icons.
 * Tapping the card opens the record.
 */
export function ListCard({ title, badge, meta, amount, children, leading, actions, onActivate, className }: ListCardProps) {
  return (
    <div
      className={cn("flex items-start gap-3 p-4", onActivate && ACTIVATABLE, onActivate && "active:bg-(--color-bg-secondary)", className)}
      {...activateProps<HTMLDivElement>(onActivate)}
    >
      {leading}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 font-semibold text-(--color-text-primary) break-words">{title}</p>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
        {meta && <p className="mt-0.5 text-xs text-(--color-text-secondary)">{meta}</p>}
        {/* The figure and the actions share the last line, so the name and the
            reference above keep the card's full width instead of wrapping
            beside a column of buttons. */}
        {(children || amount || actions) && (
          <div className="mt-1 flex items-center gap-3">
            <div className="min-w-0 flex-1">{children}</div>
            {amount && (
              <span className="shrink-0 font-semibold tabular-nums text-(--color-text-primary)">{amount}</span>
            )}
            {actions && <div className="-me-3 -my-2 shrink-0">{actions}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
