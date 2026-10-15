"use client";

import { useTranslation } from "react-i18next";
import { Columns3, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableColumnsState } from "@/hooks/useTableColumns";
import { Button } from "./Button";
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "./Menu";

/**
 * "Columns" — tick what the list shows. The choice is saved to the account, so
 * it follows the person to their other devices.
 *
 * Desktop only: below md the list is a stack of cards, which has no columns.
 */
export function ColumnPicker({ columns, className }: { columns: TableColumnsState; className?: string }) {
  const { t } = useTranslation("common");
  if (columns.options.length === 0) return null;

  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <Button variant="secondary" size="sm" className={cn("hidden md:inline-flex", className)}>
          <Columns3 className="h-4 w-4" />
          {t("table.columns")}
          {columns.hiddenCount > 0 && (
            <span className="ms-0.5 rounded-full bg-(--color-bg-tertiary) px-1.5 text-xs tabular-nums text-(--color-text-secondary)">
              {columns.hiddenCount}
            </span>
          )}
        </Button>
      </MenuTrigger>
      <MenuContent className="min-w-56">
        <MenuLabel>{t("table.columnsTitle")}</MenuLabel>
        {columns.options.map((option) => (
          <MenuCheckboxItem
            key={option.key}
            checked={option.visible}
            // Stay open: people untick three columns, not one.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => columns.toggle(option.key)}
          >
            <span className="flex-1">{option.label}</span>
            {option.visible && option.empty && (
              <span className="text-xs text-(--color-text-tertiary)" title={t("table.emptyColumnHint")}>
                {t("table.emptyColumn")}
              </span>
            )}
          </MenuCheckboxItem>
        ))}
        {columns.hiddenCount > 0 && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={columns.reset}>
              <RotateCcw className="h-4 w-4 opacity-70" />
              {t("table.showAllColumns")}
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
