import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DOCK_BELOW, Tour, type TourStep } from "@/components/tour/Tour";
import { useTourCompletion } from "@/components/tour/useTourCompletion";
import { useTourStore } from "@/stores/useTourStore";

interface PosTourProps {
  /** Below lg the cart and the products are tabs: each step shows the one it talks about. */
  showTab: (tab: "cart" | "products") => void;
}

/**
 * The till's own short tour: four steps, no welcome card, started the first
 * time a session is open. For a cashier who never sees the back office it is
 * the only tour there is. Replayed from the till's menu.
 */
export function PosTour({ showTab }: PosTourProps) {
  const { t } = useTranslation("pos");
  const active = useTourStore((s) => s.active);
  const { start, stop } = useTourStore();
  const { shouldAutoStart, markDone } = useTourCompletion("pos");

  useEffect(() => {
    if (shouldAutoStart && useTourStore.getState().active === null) start("pos");
  }, [shouldAutoStart, start]);

  // Leaving the till mid-tour ends it.
  useEffect(() => {
    return () => {
      if (useTourStore.getState().active === "pos") useTourStore.getState().stop();
    };
  }, []);

  const end = useCallback(() => {
    stop();
    showTab("products");
    markDone();
  }, [stop, showTab, markDone]);

  const steps = useMemo<TourStep[]>(() => {
    // From lg up the cart and the products sit side by side: nothing moves.
    const show = (tab: "cart" | "products") => () => {
      showTab(tab);
      return window.innerWidth < DOCK_BELOW;
    };
    return [
      { id: "search", targets: ["pos-search"], prepare: show("products"), title: t("tour.search.title"), body: t("tour.search.body") },
      { id: "cart", targets: ["pos-cart"], prepare: show("cart"), title: t("tour.cart.title"), body: t("tour.cart.body") },
      { id: "pay", targets: ["pos-pay"], prepare: show("cart"), title: t("tour.pay.title"), body: t("tour.pay.body") },
      { id: "menu", targets: ["pos-menu"], title: t("tour.menu.title"), body: t("tour.menu.body") },
    ];
  }, [t, showTab]);

  if (active !== "pos") return null;
  return <Tour steps={steps} label={t("tour.label")} finishLabel={t("tour.finish")} onFinish={end} onSkip={end} />;
}
