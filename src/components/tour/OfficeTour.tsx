import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/shared/Logo";
import { Button, Modal } from "@/components/ui";
import { usePathname } from "@/lib/navigation";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTourStore } from "@/stores/useTourStore";
import { DOCK_BELOW, Tour, type TourStep } from "./Tour";
import { useTourCompletion } from "./useTourCompletion";

interface OfficeTourProps {
  /** Opens or closes the navigation drawer (a no-op from lg up, where the rail is pinned). */
  setSidebarOpen: (open: boolean) => void;
}

/**
 * The back office's first-login tour: a welcome card on the dashboard, then
 * seven lit steps through the rail. Steps this person cannot see (no
 * permission, not in the offer, not on this page) are skipped by the tour
 * itself. Replayed from the help button at the foot of the rail.
 */
export function OfficeTour({ setSidebarOpen }: OfficeTourProps) {
  const { t } = useTranslation("common");
  const pathname = usePathname();
  const displayName = useAuthStore((s) => s.currentUser?.display_name);
  const { active, start, stop } = useTourStore();
  const { shouldAutoStart, markDone } = useTourCompletion("office");
  const later = useTourStore((s) => s.officePostponed);
  const postpone = useTourStore((s) => s.postponeOffice);

  // First login: the dashboard is where everyone lands, and where the tour's
  // dashboard step can find its target.
  const onDashboard = /\/dashboard\/?$/.test(pathname);
  const showWelcome = shouldAutoStart && onDashboard && !later && active === null;

  const end = useCallback(() => {
    stop();
    setSidebarOpen(false);
    markDone();
  }, [stop, setSidebarOpen, markDone]);

  // Leaving the till (or any page) mid-tour ends it rather than leaving the
  // screen dimmed over a page it does not describe.
  useEffect(() => {
    return () => {
      if (useTourStore.getState().active === "office") useTourStore.getState().stop();
    };
  }, []);

  const steps = useMemo<TourStep[]>(() => {
    // The rail is a drawer below lg only; from lg up nothing moves.
    const isDrawer = () => window.innerWidth < DOCK_BELOW;
    const inRail = () => {
      setSidebarOpen(true);
      return isDrawer();
    };
    const onPage = () => {
      setSidebarOpen(false);
      return isDrawer();
    };
    return [
      { id: "base", targets: ["nav-clients", "nav-products"], prepare: inRail, title: t("tour.office.base.title"), body: t("tour.office.base.body") },
      { id: "documents", targets: ["nav-quotes", "nav-invoices", "nav-delivery-notes"], prepare: inRail, title: t("tour.office.documents.title"), body: t("tour.office.documents.body") },
      { id: "dashboard", targets: ["dashboard-stats"], prepare: onPage, title: t("tour.office.dashboard.title"), body: t("tour.office.dashboard.body") },
      { id: "pos", targets: ["nav-pos"], prepare: inRail, title: t("tour.office.pos.title"), body: t("tour.office.pos.body") },
      { id: "reports", targets: ["nav-reports"], prepare: inRail, title: t("tour.office.reports.title"), body: t("tour.office.reports.body") },
      { id: "settings", targets: ["nav-settings"], prepare: inRail, title: t("tour.office.settings.title"), body: t("tour.office.settings.body") },
      { id: "help", targets: ["tour-help"], prepare: inRail, title: t("tour.office.help.title"), body: t("tour.office.help.body") },
    ];
  }, [t, setSidebarOpen]);

  return (
    <>
      <Modal isOpen={showWelcome} onClose={postpone} title={t("tour.welcome.title", { name: displayName ?? "" })} size="sm">
        <div className="grid gap-4 text-center">
          <Logo className="mx-auto h-12 w-12 text-primary-600 dark:text-primary-400" title="Probook" />
          <p className="text-sm text-(--color-text-secondary)">{t("tour.welcome.body")}</p>
          <div className="grid grid-cols-3 gap-2 text-xs text-(--color-text-secondary)">
            {[
              { key: "sell", title: t("tour.welcome.sell.title"), body: t("tour.welcome.sell.body") },
              { key: "manage", title: t("tour.welcome.manage.title"), body: t("tour.welcome.manage.body") },
              { key: "follow", title: t("tour.welcome.follow.title"), body: t("tour.welcome.follow.body") },
            ].map((area) => (
              <div key={area.key} className="rounded-lg border border-(--color-border-primary) bg-(--color-bg-secondary) px-1 py-2">
                <span className="block text-sm font-semibold text-(--color-text-primary)">{area.title}</span>
                {area.body}
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            <Button onClick={() => start("office")}>{t("tour.welcome.start")}</Button>
            <Button variant="ghost" onClick={postpone}>
              {t("tour.welcome.later")}
            </Button>
          </div>
          <p className="text-xs text-(--color-text-tertiary)">{t("tour.welcome.replayHint")}</p>
        </div>
      </Modal>
      {active === "office" && (
        <Tour steps={steps} finishLabel={t("tour.finish")} onFinish={end} onSkip={end} />
      )}
    </>
  );
}
