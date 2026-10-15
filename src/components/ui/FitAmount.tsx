import { type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Widest glyph advance of a formatted figure, in em — digits in a monospaced face. */
const GLYPH_EM = 0.62;

/**
 * A figure that shrinks to fit the width it is given instead of spilling out.
 *
 * Intl separates thousands with U+202F and the currency with U+00A0, both
 * no-break, so "1 473 500,00 DZD" is one unbreakable word: in a tile narrower
 * than the figure it runs over its neighbour's figure ("DZD" and "77 070"
 * printed on top of each other). Breaking anywhere is no better — a total
 * split mid-number or the Arabic mark "د.ج." losing its final dot reads as a
 * different amount.
 *
 * So the figure keeps its line and its size is capped instead: the element
 * measures its own width (inline-size container) and the text inside is set
 * at the smaller of the inherited size (1em — the caller's text-xl, text-2xl…)
 * and the size at which this many characters fill that width. Short figures
 * are untouched; only the one that would overflow gets smaller.
 *
 * It is a block, and an inline-size container contributes no intrinsic width:
 * inside a flex row give its parent `min-w-0 flex-1`, or it collapses.
 */
export function FitAmount({ children, className }: { children: string | number; className?: string }) {
  const text = String(children);
  // Direction marks the Arabic format adds take no room.
  const chars = Math.max(text.replace(/[‎‏‪-‮]/g, "").length, 1);
  return (
    <span className={cn("@container block min-w-0", className)}>
      <span
        className="block whitespace-nowrap tabular-nums"
        style={{ fontSize: `min(1em, calc(100cqi / ${(chars * GLYPH_EM).toFixed(2)}))` } as CSSProperties}
      >
        {text}
      </span>
    </span>
  );
}
