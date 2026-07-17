import { useTranslation } from "react-i18next";
import { ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { useDashboardStore } from "@/stores/useDashboardStore";
import { useDashboardLayoutSync } from "@/features/dashboard/hooks/useDashboardLayoutSync";

export function DashboardCustomization() {
  const { t } = useTranslation(["settings", "dashboard"]);
  const order = useDashboardStore((s) => s.order);
  const hidden = useDashboardStore((s) => s.hidden);
  const toggleStore = useDashboardStore((s) => s.toggle);
  const moveUpStore = useDashboardStore((s) => s.moveUp);
  const moveDownStore = useDashboardStore((s) => s.moveDown);
  const resetStore = useDashboardStore((s) => s.reset);
  const { save } = useDashboardLayoutSync();

  // Persist to the server (cross-device) after each local change.
  const toggle = (id: Parameters<typeof toggleStore>[0]) => { toggleStore(id); save(); };
  const moveUp = (id: Parameters<typeof moveUpStore>[0]) => { moveUpStore(id); save(); };
  const moveDown = (id: Parameters<typeof moveDownStore>[0]) => { moveDownStore(id); save(); };
  const reset = () => { resetStore(); save(); };

  return (
    <div className="space-y-4">
      <p className="text-sm text-(--color-text-secondary)">
        {t("dashboardCustomization.description")}
      </p>

      <ul className="divide-y divide-(--color-border) border border-(--color-border) rounded-lg overflow-hidden">
        {order.map((id, index) => {
          const isVisible = !hidden.includes(id);
          return (
            <li
              key={id}
              className="flex items-center justify-between gap-3 px-4 py-3 bg-(--color-bg-secondary)"
            >
              <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  checked={isVisible}
                  onChange={() => toggle(id)}
                />
                <span
                  className={
                    isVisible
                      ? "text-sm font-medium text-(--color-text-primary) truncate"
                      : "text-sm text-(--color-text-secondary) line-through truncate"
                  }
                >
                  {t(`dashboard:stats.${id}`)}
                </span>
              </label>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => moveUp(id)}
                  disabled={index === 0}
                  aria-label={t("dashboardCustomization.moveUp")}
                  title={t("dashboardCustomization.moveUp")}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => moveDown(id)}
                  disabled={index === order.length - 1}
                  aria-label={t("dashboardCustomization.moveDown")}
                  title={t("dashboardCustomization.moveDown")}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={reset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          {t("dashboardCustomization.reset")}
        </Button>
      </div>
    </div>
  );
}
