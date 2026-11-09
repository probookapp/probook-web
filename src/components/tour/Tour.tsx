import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface TourStep {
  id: string;
  /**
   * `data-tour` names of the elements to light up together (Clients and
   * Products are one step). A step whose elements are all missing or hidden
   * is skipped: that is how permissions, the offer and the current page shape
   * the tour without the tour knowing about any of them.
   */
  targets: string[];
  title: string;
  body: string;
  /**
   * Brings the elements on screen first (opens the drawer, switches a tab).
   * Returns true when it moved something, so the tour waits for it to settle.
   */
  prepare?: () => boolean;
}

/** Mount it to start the tour, unmount it to end it: each opening starts at step one. */
interface TourProps {
  steps: TourStep[];
  /** Shown before the step counter ("Caisse · 2 / 4"). */
  label?: string;
  finishLabel: string;
  /** Last step confirmed. */
  onFinish: () => void;
  /** "Skip the tour" or Escape. */
  onSkip: () => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;
const GAP = 14;
const MARGIN = 12;
/** Below lg the drawer and the till's tabs move things around: the bubble docks to an edge. */
export const DOCK_BELOW = 1024;
/** Long enough for the drawer's 200 ms slide. */
const SETTLE_MS = 260;

function visibleTargets(names: string[]): HTMLElement[] {
  return names.flatMap((name) =>
    Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && el.getClientRects().length > 0;
    })
  );
}

function unionBox(els: HTMLElement[]): Box | null {
  if (els.length === 0) return null;
  let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  return { top: top - PAD, left: left - PAD, width: right - left + PAD * 2, height: bottom - top + PAD * 2 };
}

function sameBox(a: Box | null, b: Box | null) {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** Where the bubble goes: beside the target on a wide screen, docked to an edge on a narrow one. */
function placeBubble(spot: Box, tipW: number, tipH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < DOCK_BELOW) {
    const targetLow = spot.top + spot.height / 2 > vh * 0.55;
    return { docked: true, top: targetLow ? MARGIN : vh - tipH - MARGIN, left: MARGIN };
  }
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), vw - tipW - MARGIN);
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), vh - tipH - MARGIN);
  const right = spot.left + spot.width + GAP;
  const below = spot.top + spot.height + GAP;
  const above = spot.top - tipH - GAP;
  const left = spot.left - tipW - GAP;
  // Logical, not physical: in the rare right-to-left case the order still finds room.
  if (right + tipW <= vw - MARGIN) return { docked: false, top: clampY(spot.top + spot.height / 2 - tipH / 2), left: right };
  if (below + tipH <= vh - MARGIN) return { docked: false, top: below, left: clampX(spot.left + spot.width / 2 - tipW / 2) };
  if (above >= MARGIN) return { docked: false, top: above, left: clampX(spot.left + spot.width / 2 - tipW / 2) };
  if (left >= MARGIN) return { docked: false, top: clampY(spot.top + spot.height / 2 - tipH / 2), left };
  return { docked: true, top: vh - tipH - MARGIN, left: MARGIN };
}

/**
 * A guided tour: the screen dims, one part of it is lit, and a bubble beside it
 * says what it is for. No library — the targets carry `data-tour` names and the
 * tour finds them, measures them every frame (the drawer slides, pages scroll)
 * and skips the ones this person cannot see.
 */
export function Tour({ steps, label, finishLabel, onFinish, onSkip }: TourProps) {
  const { t } = useTranslation("common");
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);
  const [bubble, setBubble] = useState<{ docked: boolean; top: number; left: number } | null>(null);
  const direction = useRef<1 | -1>(1);
  const tipRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const settled = useRef(false);

  const step = steps[index];

  // Bring the step's elements on screen, then skip it if nothing is there.
  // Until it settles the frame loop below leaves the light where it was, so
  // moving between steps slides the light rather than flashing the screen.
  useEffect(() => {
    if (!step) return;
    settled.current = false;
    const moved = step.prepare?.() ?? false;
    const timer = window.setTimeout(() => {
      const els = visibleTargets(step.targets);
      if (els.length === 0) {
        const next = index + direction.current;
        if (next >= steps.length) onFinish();
        else if (next < 0) setIndex(0);
        else setIndex(next);
        return;
      }
      const r = els[0].getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) {
        els[0].scrollIntoView({ block: "center", inline: "nearest" });
      }
      settled.current = true;
      nextRef.current?.focus({ preventScroll: true });
    }, moved ? SETTLE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [step, index, steps.length, onFinish]);

  // Follow the target while it moves (drawer, scroll, resize).
  useLayoutEffect(() => {
    if (!step) return;
    let frame = 0;
    let lastSpot: Box | null = null;
    const tick = () => {
      if (settled.current) {
        const box = unionBox(visibleTargets(step.targets));
        if (!sameBox(box, lastSpot)) {
          lastSpot = box;
          setSpot(box);
        }
        const tip = tipRef.current;
        if (box && tip) {
          const place = placeBubble(box, tip.offsetWidth, tip.offsetHeight);
          setBubble((prev) =>
            prev && prev.docked === place.docked && Math.abs(prev.top - place.top) < 0.5 && Math.abs(prev.left - place.left) < 0.5
              ? prev
              : place
          );
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step]);

  const go = useCallback(
    (delta: 1 | -1) => {
      direction.current = delta;
      const next = index + delta;
      if (next >= steps.length) onFinish();
      else if (next >= 0) setIndex(next);
    },
    [index, steps.length, onFinish]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSkip();
      } else if (e.key === "ArrowRight") {
        go(1);
      } else if (e.key === "ArrowLeft" && index > 0) {
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onSkip, index]);

  if (!step || typeof document === "undefined") return null;
  const last = index === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-testid="tour">
      {/* Swallows clicks: the page underneath is to look at, not to use, until the tour ends. */}
      <div className={cn("absolute inset-0", !spot && "bg-gray-950/55")} />
      {spot && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary-400 shadow-[0_0_0_9999px_rgb(3_7_18/0.55)] motion-safe:transition-all motion-safe:duration-300"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      )}
      <div
        ref={tipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className={cn(
          "absolute grid gap-2.5 rounded-xl border border-(--color-border-primary) bg-(--color-bg-elevated) p-4 shadow-2xl",
          bubble?.docked ? "inset-x-3 mb-[env(safe-area-inset-bottom)]" : "w-80",
          !bubble && "invisible",
          "motion-safe:transition-[top,left] motion-safe:duration-300"
        )}
        style={bubble ? { top: bubble.top, ...(bubble.docked ? {} : { left: bubble.left }) } : { top: 0, left: 0 }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs tracking-wide text-(--color-text-tertiary)">
            {label ? `${label} · ` : ""}
            {t("tour.counter", { current: index + 1, total: steps.length })}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-(--color-text-secondary) underline underline-offset-2 hover:text-(--color-text-primary)"
          >
            {t("tour.skip")}
          </button>
        </div>
        <h2 id="tour-title" className="text-base font-semibold text-balance text-(--color-text-primary)">
          {step.title}
        </h2>
        <p id="tour-body" className="text-sm text-(--color-text-secondary)">
          {step.body}
        </p>
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "h-1.5 rounded-full",
                  i === index ? "w-4 bg-primary-600 dark:bg-primary-400" : "w-1.5 bg-(--color-border-primary)"
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="secondary" size="sm" onClick={() => go(-1)}>
                {t("buttons.previous")}
              </Button>
            )}
            <Button ref={nextRef} size="sm" onClick={() => go(1)}>
              {last ? finishLabel : t("buttons.next")}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
