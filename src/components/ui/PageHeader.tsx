"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** The page's buttons — "New …", export, import. */
  actions?: ReactNode;
  className?: string;
}

/**
 * A list page's title and buttons, kept in view while the list scrolls.
 *
 * Halfway down three hundred invoices, "New invoice" used to be three hundred
 * rows away. From md up the header sticks to the top of the scrolling area
 * (under the layout's own top bar where there is one — see --sticky-top in
 * Layout and AdminLayout). Not on a phone: there the title and its buttons wrap
 * onto several lines, and a header that tall would leave little room for the
 * list it is meant to serve.
 *
 * It must be a direct child of the page's root, which spans the whole list: a
 * sticky element only sticks within its parent. It runs edge to edge across the
 * layout's padding so rows scrolling underneath never show at its sides, and
 * draws its bottom rule only once it is stuck.
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-(--color-text-primary)">{title}</h1>
          {subtitle && <p className="text-sm sm:text-base text-(--color-text-secondary)">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 self-start sm:self-auto">{actions}</div>}
      </div>
    </div>
  );
}
