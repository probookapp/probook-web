"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the viewport is below the `lg` breakpoint — a phone or a small tablet.
 *
 * Read through useSyncExternalStore rather than an effect so the server snapshot
 * (false: assume the wide layout) is also what React uses during hydration. The
 * client then re-renders with the real answer, with no mismatch and no state
 * written from inside an effect.
 *
 * This decides which line editor a document form renders. Only one is mounted at
 * a time on purpose: two trees would register the same react-hook-form field
 * names twice, and the second registration would take the first one's ref.
 */
const QUERY = "(max-width: 1023px)"; // Tailwind's lg breakpoint is 1024px.

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

export function useIsNarrow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
