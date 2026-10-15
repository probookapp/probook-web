"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A menu that floats: portalled to the body, so a table's horizontal scroll or a
 * card's rounded clip never cuts it off, and keyboard-driven by Radix (arrows,
 * typeahead, Escape) without any of that being written here.
 */

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export const MenuContent = forwardRef<
  ElementRef<typeof DropdownMenu.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(({ className, sideOffset = 4, align = "end", collisionPadding = 8, ...props }, ref) => (
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      collisionPadding={collisionPadding}
      className={cn(
        // Genuinely floating, so it earns the shadow the rest of the page does not.
        "z-50 min-w-48 max-h-[min(70vh,28rem)] overflow-y-auto",
        "rounded-lg border border-(--color-border-primary) bg-(--color-bg-elevated) p-1 shadow-lg",
        "text-sm text-(--color-text-primary) focus:outline-none",
        className
      )}
      {...props}
    />
  </DropdownMenu.Portal>
));
MenuContent.displayName = "MenuContent";

const ITEM =
  "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 lg:py-1.5 " +
  "outline-none data-highlighted:bg-(--color-bg-tertiary) " +
  "data-disabled:pointer-events-none data-disabled:opacity-45";

export const MenuItem = forwardRef<
  ElementRef<typeof DropdownMenu.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { tone?: "default" | "danger" }
>(({ className, tone = "default", ...props }, ref) => (
  <DropdownMenu.Item
    ref={ref}
    className={cn(
      ITEM,
      tone === "danger" && "text-danger-600 dark:text-danger-400 data-highlighted:bg-danger-50 dark:data-highlighted:bg-danger-950/40",
      className
    )}
    {...props}
  />
));
MenuItem.displayName = "MenuItem";

export const MenuCheckboxItem = forwardRef<
  ElementRef<typeof DropdownMenu.CheckboxItem>,
  ComponentPropsWithoutRef<typeof DropdownMenu.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenu.CheckboxItem ref={ref} className={cn(ITEM, "ps-8", className)} {...props}>
    <span className="absolute start-2.5 flex h-4 w-4 items-center justify-center">
      <DropdownMenu.ItemIndicator>
        <Check className="h-4 w-4 text-primary-600 dark:text-primary-400" />
      </DropdownMenu.ItemIndicator>
    </span>
    {children}
  </DropdownMenu.CheckboxItem>
));
MenuCheckboxItem.displayName = "MenuCheckboxItem";

export function MenuSeparator({ className }: { className?: string }) {
  return <DropdownMenu.Separator className={cn("-mx-1 my-1 h-px bg-(--color-border-primary)", className)} />;
}

export function MenuLabel({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn("px-2.5 pt-1.5 pb-1 text-xs font-semibold uppercase tracking-wider text-(--color-text-tertiary)", className)}
      {...props}
    />
  );
}
