import { useEffect, useCallback, useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface NavigationGuard {
  isBlocked: boolean;
  proceed: () => void;
  reset: () => void;
  /** Runs `action` now, or holds it behind the dialog while the form is dirty. */
  guard: (action: () => void) => void;
}

// The guard of the form on screen, so navigation that is not a link — the POS
// button in the sidebar — can ask it first. One form page is mounted at a time.
let activeGuard: ((action: () => void) => void) | null = null;

/** Navigation from outside the form page goes through this, not straight to the router. */
export function runGuarded(action: () => void) {
  if (activeGuard) activeGuard(action);
  else action();
}

// The Navigation API gives each history entry an index, which tells a Back from
// a Forward. Without it a popstate on a form page is taken for a Back, which it
// almost always is: the page was just pushed, so there is nothing ahead of it.
function historyIndex(): number | null {
  const nav = (window as unknown as { navigation?: { currentEntry?: { index: number } } }).navigation;
  return nav?.currentEntry?.index ?? null;
}

// Listeners on window run in the order they were added, and the App Router's
// popstate listener renders the previous page synchronously. Added from the
// hook, ours came second and found the form already unmounted. So the one
// listener is added when this module loads — Providers imports it for that, so
// it is before the router mounts — and hands the event to the form on screen.
let activePopState: ((e: PopStateEvent) => void) | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", (e) => activePopState?.(e), true);
}

/**
 * Holds navigation away from a dirty form behind a confirmation.
 *
 * It stops navigation where it starts, before anything renders: a capture-phase
 * click listener for links (sidebar, breadcrumbs, any <Link>), `guard()` for the
 * page's own Back and Cancel buttons, a capture-phase popstate listener for the
 * browser and Android back button, and beforeunload for closing or reloading.
 * Intercepting `history.pushState` does not work with the App Router: Next calls
 * it only once the next page has rendered, after the form is already gone.
 */
export function useUnsavedChangesGuard(when: boolean | (() => boolean)): NavigationGuard {
  const router = useRouter();
  const [isBlocked, setIsBlocked] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);

  // Read through a ref so the effects below install once rather than on every
  // keystroke in the form.
  const whenRef = useRef(when);
  useEffect(() => {
    whenRef.current = when;
  });
  const shouldBlock = useCallback(() => {
    const current = whenRef.current;
    return typeof current === "function" ? current() : current;
  }, []);

  const guard = useCallback(
    (action: () => void) => {
      if (!shouldBlock()) {
        action();
        return;
      }
      pendingNavigation.current = action;
      setIsBlocked(true);
    },
    [shouldBlock]
  );

  const proceed = useCallback(() => {
    setIsBlocked(false);
    const action = pendingNavigation.current;
    pendingNavigation.current = null;
    action?.();
  }, []);

  const reset = useCallback(() => {
    setIsBlocked(false);
    pendingNavigation.current = null;
  }, []);

  useEffect(() => {
    activeGuard = guard;
    return () => {
      if (activeGuard === guard) activeGuard = null;
    };
  }, [guard]);

  // Links. Capture phase on the document runs before React's handlers, and
  // preventDefault is enough: <Link> still runs its own onClick (the sidebar
  // closes its drawer) and then skips navigating because the default is gone.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // An anchor on the same page leaves nothing behind.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!shouldBlock()) return;
      e.preventDefault();
      guard(() => router.push(url.pathname + url.search + url.hash));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [guard, router, shouldBlock]);

  // Back and Forward. By the time popstate fires the URL has already moved, but
  // the router has not rendered anything yet: the module-level listener above
  // runs ahead of it, so this can stop the event and step back to the form.
  useEffect(() => {
    let index = historyIndex();
    let restoring = false;
    let leaving = false;

    const onPopState = (e: PopStateEvent) => {
      if (leaving) {
        leaving = false;
        return;
      }
      if (restoring) {
        restoring = false;
        index = historyIndex();
        e.stopImmediatePropagation();
        return;
      }
      if (!shouldBlock()) return;
      const now = historyIndex();
      const delta = index !== null && now !== null ? index - now : 1;
      if (delta === 0) return;
      e.stopImmediatePropagation();
      restoring = true;
      window.history.go(delta);
      pendingNavigation.current = () => {
        leaving = true;
        window.history.go(-delta);
      };
      setIsBlocked(true);
    };
    activePopState = onPopState;
    return () => {
      if (activePopState === onPopState) activePopState = null;
    };
  }, [shouldBlock]);

  // Browser close / refresh
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (shouldBlock()) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shouldBlock]);

  return { isBlocked, proceed, reset, guard };
}
