"use client";

import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "./Menu";

export interface RowAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  /**
   * Shown as an icon beside the menu instead of inside it. Keep it to the one
   * thing a row is most often opened for in its current state — "mark as paid"
   * on an issued invoice, "edit" on a draft — so the column keeps its width.
   */
  primary?: boolean;
  /** Destructive: drawn in red and set apart at the bottom of the menu. */
  danger?: boolean;
  disabled?: boolean;
  /** Why it is disabled — shown on hover beside the icon, under the label in the menu. */
  disabledReason?: string;
  /** Leaves the action out entirely — for permission and state checks inline. */
  hidden?: boolean;
  /** Hover colour of a primary icon, so "mark paid" can still read green. */
  tone?: "primary" | "success" | "warning" | "info";
}

const TONE_HOVER: Record<NonNullable<RowAction["tone"]>, string> = {
  primary: "hover:text-primary-600",
  success: "hover:text-green-600",
  warning: "hover:text-amber-600",
  info: "hover:text-blue-600",
};

const ICON_BUTTON =
  "p-3 lg:p-1.5 rounded-md text-gray-500 transition-colors disabled:opacity-45 disabled:cursor-not-allowed " +
  "hover:bg-(--color-bg-tertiary) focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500";

/**
 * A row's actions as a fixed-width cluster: at most a primary icon or two, then
 * "⋯" for everything else.
 *
 * Seven icons side by side used to make the actions column the widest thing on
 * the page, which pushed it past the edge of the table — the buttons people
 * reach for most were the ones they had to scroll sideways to find.
 *
 * Clicks never reach the row: a row that opens its document on click must not
 * also open it when someone presses "delete".
 */
export function RowActions({ actions, className }: { actions: RowAction[]; className?: string }) {
  const { t } = useTranslation("common");
  const shown = actions.filter((a) => !a.hidden);
  const inline = shown.filter((a) => a.primary);
  const regular = shown.filter((a) => !a.primary && !a.danger);
  const danger = shown.filter((a) => !a.primary && a.danger);

  return (
    <div
      className={cn("flex items-center justify-end gap-2 lg:gap-1", className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {inline.map((action) => {
        const Icon = action.icon;
        const button = (
          <button
            key={action.key}
            type="button"
            onClick={action.onSelect}
            disabled={action.disabled}
            className={cn(
              ICON_BUTTON,
              action.danger ? "hover:text-red-600" : TONE_HOVER[action.tone ?? "primary"]
            )}
            title={action.label}
            aria-label={action.label}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
        // A disabled button gets no pointer events, so the reason hangs on a wrapper.
        return action.disabled && action.disabledReason ? (
          <span key={action.key} title={action.disabledReason} className="inline-flex">
            {button}
          </span>
        ) : (
          button
        );
      })}
      {regular.length + danger.length > 0 ? (
        <Menu modal={false}>
          <MenuTrigger asChild>
            <button
              type="button"
              className={cn(ICON_BUTTON, "hover:text-(--color-text-primary) data-[state=open]:bg-(--color-bg-tertiary)")}
              title={t("buttons.moreActions")}
              aria-label={t("buttons.moreActions")}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </MenuTrigger>
          <MenuContent>
            {regular.map((action) => (
              <ActionItem key={action.key} action={action} />
            ))}
            {danger.length > 0 && (
              <Fragment>
                {regular.length > 0 && <MenuSeparator />}
                {danger.map((action) => (
                  <ActionItem key={action.key} action={action} />
                ))}
              </Fragment>
            )}
          </MenuContent>
        </Menu>
      ) : (
        // Keeps the column the same width on rows with nothing in the menu.
        inline.length === 0 && <span className={cn(ICON_BUTTON, "invisible")} aria-hidden><MoreHorizontal className="h-4 w-4" /></span>
      )}
    </div>
  );
}

function ActionItem({ action }: { action: RowAction }) {
  const Icon = action.icon;
  return (
    <MenuItem
      tone={action.danger ? "danger" : "default"}
      disabled={action.disabled}
      onSelect={action.onSelect}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-70" />
      {action.disabled && action.disabledReason ? (
        <span className="flex flex-col">
          {action.label}
          <span className="text-xs text-(--color-text-tertiary)">{action.disabledReason}</span>
        </span>
      ) : (
        action.label
      )}
    </MenuItem>
  );
}
