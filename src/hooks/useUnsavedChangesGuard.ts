import { useEffect, useCallback, useState, useRef } from "react";

interface NavigationGuard {
  isBlocked: boolean;
  proceed: () => void;
  reset: () => void;
}

export function useUnsavedChangesGuard(when: boolean | (() => boolean)): NavigationGuard {
  const shouldBlock = typeof when === "function" ? when : () => when;
  const [isBlocked, setIsBlocked] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);

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

    const intercept = (original: typeof window.history.pushState) => {
      return function (this: History, ...args: Parameters<typeof window.history.pushState>) {
        if (shouldBlock()) {
          setIsBlocked(true);
          pendingNavigation.current = () => original.apply(this, args);
          return;
        }
        return original.apply(this, args);
      };
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
