import { useEffect, useCallback, useState, useRef } from "react";

interface NavigationGuard {
  isBlocked: boolean;
  proceed: () => void;
  reset: () => void;
}

export function useUnsavedChangesGuard(when: boolean | (() => boolean)): NavigationGuard {
  const [isBlocked, setIsBlocked] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);

  // Read through a ref so the effects below install once. Depending on `when`
  // directly re-ran them on every render — every keystroke in a form swapped
  // history.pushState out and back and re-registered the unload listener.
  const whenRef = useRef(when);
  useEffect(() => {
    whenRef.current = when;
  });
  const shouldBlock = useCallback(() => {
    const current = whenRef.current;
    return typeof current === "function" ? current() : current;
  }, []);

  const proceed = useCallback(() => {
    setIsBlocked(false);
    if (pendingNavigation.current) {
      pendingNavigation.current();
      pendingNavigation.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setIsBlocked(false);
    pendingNavigation.current = null;
  }, []);

  // Intercept Next.js client-side navigation (pushState/replaceState)
  useEffect(() => {
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    // The originals are already bound to window.history, so the wrappers need
    // no `this` of their own.
    const intercept = (original: typeof window.history.pushState) =>
      (...args: Parameters<typeof window.history.pushState>) => {
        if (shouldBlock()) {
          setIsBlocked(true);
          pendingNavigation.current = () => original(...args);
          return;
        }
        return original(...args);
      };

    window.history.pushState = intercept(originalPushState);
    window.history.replaceState = intercept(originalReplaceState);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
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

  return { isBlocked, proceed, reset };
}
