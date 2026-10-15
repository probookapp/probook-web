"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "./Menu";
import type { RowAction } from "./RowActions";

/** The page's one creating action: "New quote", "New client"… */
export interface PagePrimaryAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /**
   * The page's main action. Drawn last among the buttons from md up; on a phone
   * it becomes a round button fixed at the bottom corner, so it stays under the
   * thumb however far down the list the reader has gone.
   */
  primaryAction?: PagePrimaryAction;
  /**
   * The page's other buttons (export, import, manage labels…). Side by side
   * from md up; folded into one "⋯" menu on a phone, where three stacked
   * buttons used to push the list below the fold.
   */
  secondaryActions?: RowAction[];
  /** Anything else, shown as is on every screen — a filter, a column picker. */
  actions?: ReactNode;
  className?: string;
}

/**
 * A list page's title and buttons, kept in view while the list scrolls.
 *
 * Halfway down three hundred invoices, "New invoice" used to be three hundred
 * rows away. From md up the header sticks to the top of the scrolling area
 * (under the layout's own top bar where there is one — see --sticky-top in
 * Layout and AdminLayout). Not on a phone: there the main action floats in the
 * corner instead, and the rest folds into "⋯", so the header is one short line.
 *
 * It must be a direct child of the page's root, which spans the whole list: a
 * sticky element only sticks within its parent. It runs edge to edge across the
 * layout's padding so rows scrolling underneath never show at its sides, and
 * draws its bottom rule only once it is stuck.
 */
export function PageHeader({ title, subtitle, primaryAction, secondaryActions, actions, className }: PageHeaderProps) {
  const { t } = useTranslation("common");
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const secondary = (secondaryActions ?? []).filter((a) => !a.hidden);

  useEffect(() => {
    const el = ref.current;
    const scroller = el?.closest("main");
    if (!el || !scroller) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const style = getComputedStyle(el);
      if (style.position !== "sticky") return setStuck(false);
      const offset = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      setStuck(scroller.scrollTop > 0 && offset <= parseFloat(style.top) + 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const PrimaryIcon = primaryAction?.icon;

  return (
    <div
      ref={ref}
      data-stuck={stuck || undefined}
      className={cn(
        "md:sticky md:top-[var(--sticky-top,0px)] z-20",
        "-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 md:-mt-3 md:py-3",
        "bg-gray-100 dark:bg-gray-900 border-b border-transparent transition-[border-color,box-shadow]",
        "data-stuck:border-(--color-border-primary) data-stuck:shadow-xs",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 sm:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-(--color-text-primary)">{title}</h1>
          {subtitle && <p className="text-sm sm:text-base text-(--color-text-secondary)">{subtitle}</p>}
        </div>

        {/* Phone: one "⋯" beside the title for everything but the main action. */}
        {secondary.length > 0 && (
          <Menu modal={false}>
            <MenuTrigger asChild>
              <Button variant="secondary" size="sm" className="md:hidden px-2.5" aria-label={t("buttons.moreActions")}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </MenuTrigger>
            <MenuContent>
              {secondary.map((action) => {
                const Icon = action.icon;
                return (
                  <MenuItem key={action.key} disabled={action.disabled} onSelect={action.onSelect} tone={action.danger ? "danger" : "default"}>
                    <Icon className="h-4 w-4 shrink-0 opacity-70" />
                    {action.label}
                  </MenuItem>
                );
              })}
            </MenuContent>
          </Menu>
        )}

        {(actions || secondary.length > 0 || primaryAction) && (
          // On a phone, whatever stays visible here (a search, a filter) gets a line
          // of its own: sized to its content it squeezed the title to a word a line.
          <div className={cn("flex flex-wrap items-center gap-2 max-md:basis-full", !actions && "max-md:hidden")}>
            {actions}
            {/* A wrapper rather than a class on each Button: a disabled Button
                with a reason renders inside a span of its own. */}
            <div className="contents max-md:hidden">
            {secondary.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.key}
                  variant="secondary"
                  size="sm"
                  onClick={action.onSelect}
                  disabled={action.disabled}
                  disabledReason={action.disabled ? action.disabledReason : undefined}
                >
                  <Icon className="h-4 w-4 me-2" />
                  {action.label}
                </Button>
              );
            })}
            {primaryAction && PrimaryIcon && (
              <Button
                size="sm"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                disabledReason={primaryAction.disabled ? primaryAction.disabledReason : undefined}
              >
                <PrimaryIcon className="h-4 w-4 me-2" />
                {primaryAction.label}
              </Button>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Phone: the main action, always within reach. data-fab lets the layout
          leave room under the last card so the button never covers it. */}
      {primaryAction && PrimaryIcon && (
        <button
          type="button"
          data-fab
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
          title={primaryAction.disabled ? primaryAction.disabledReason ?? primaryAction.label : primaryAction.label}
          aria-label={primaryAction.label}
          className={cn(
            "md:hidden fixed z-30 end-4 bottom-[max(1rem,env(safe-area-inset-bottom))]",
            "flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg",
            "active:bg-primary-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
            "disabled:opacity-45 disabled:cursor-not-allowed"
          )}
        >
          <PrimaryIcon className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
