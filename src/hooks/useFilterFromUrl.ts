import { useEffect } from "react";

/**
 * Starts a list filter from the address, once, on mount: "?status=unpaid"
 * opens the list already filtered, which is how a dashboard figure links to
 * the rows behind it. Values outside `allowed` are ignored, so a hand-typed
 * address cannot put the select in a state it has no option for.
 */
export function useFilterFromUrl(
  name: string,
  allowed: readonly string[],
  apply: (value: string) => void
) {
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get(name);
    if (value !== null && allowed.includes(value)) apply(value);
    // Read once: afterwards the select owns the filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
