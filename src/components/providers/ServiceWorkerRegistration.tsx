"use client";

import { useEffect } from "react";

/**
 * Registers the offline worker, one per build.
 *
 * The build id rides in the script URL, so every deploy is a new worker with
 * its own static cache, and the one before last is dropped on activation —
 * without it the cache only ever grew, and `storage.persist()` below means the
 * browser never trims it either.
 *
 * A new worker takes over silently (skipWaiting in sw.js) and nothing reloads:
 * the open page keeps running its build, whose chunks are still in the previous
 * build's cache, and the next navigation fetches the new one. Reloading on
 * `controllerchange` wiped whatever the visitor was typing — on a first visit
 * too, since clients.claim() fires it there as well.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Not in development: dev chunk URLs are not content-hashed, so the
    // worker's cache-first rule for /_next/static/ serves yesterday's code
    // after an edit. Drop a worker an earlier dev session left behind.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      return;
    }

    let interval: ReturnType<typeof setInterval> | undefined;
    navigator.serviceWorker
      .register(`/sw.js?build=${encodeURIComponent(process.env.SW_BUILD_ID ?? "")}`)
      .then((reg) => {
        // A tab left open across a deploy still picks up sw.js changes.
        interval = setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch((err) => {
        console.warn("Service worker registration failed:", err);
      });

    // Request persistent storage so the browser never evicts our IndexedDB cache
    navigator.storage?.persist?.();

    return () => clearInterval(interval);
  }, []);

  return null;
}
