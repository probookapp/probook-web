import type { KeyboardEvent, MouseEvent } from "react";

/** What a click on a row or card must leave alone: it belongs to a control inside it. */
const INTERACTIVE = "a, button, input, select, textarea, label, [role=menuitem], [role=checkbox], [data-row-ignore]";

/** Cursor and keyboard focus ring for a row or card that opens its record. */
export const ACTIVATABLE =
  "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500";

/**
 * Click and Enter handlers that make a whole row (or card) open its record,
 * shared by TableRow and ListCard so both draw the same line between "open
 * this" and "press the button inside it".
 */
export function activateProps<E extends HTMLElement>(
  onActivate: (() => void) | undefined,
  onClick?: (e: MouseEvent<E>) => void,
  onKeyDown?: (e: KeyboardEvent<E>) => void
) {
  return {
    tabIndex: onActivate ? 0 : undefined,
    onClick: (e: MouseEvent<E>) => {
      onClick?.(e);
      if (!onActivate || e.defaultPrevented) return;
      const target = e.target as Element;
      // A menu portalled out of the row still bubbles here through React.
      if (!e.currentTarget.contains(target) || target.closest(INTERACTIVE)) return;
      // Selecting a number to copy it is not a request to open the document.
      if (window.getSelection()?.toString()) return;
      onActivate();
    },
    onKeyDown: (e: KeyboardEvent<E>) => {
      onKeyDown?.(e);
      if (onActivate && e.key === "Enter" && e.target === e.currentTarget) onActivate();
    },
  };
}
