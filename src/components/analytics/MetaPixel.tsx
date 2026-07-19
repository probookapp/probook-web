"use client";

import { useEffect } from "react";

// Meta (Facebook) Pixel — loaded only on public marketing pages, matching the
// disclosure in the privacy policy. The `Contact` event is fired separately from
// the WhatsApp CTA (see WhatsAppCta.tsx).
const PIXEL_ID = "916859841427368";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded?: boolean;
  version?: string;
  push?: unknown;
};

// Module-level guard so the pixel bootstraps once per page load even if multiple
// <MetaPixel /> instances mount (e.g. a public layout plus a page inside it).
let bootstrapped = false;

/**
 * Fire a Meta Pixel standard event. Safe to call anywhere: before the pixel
 * library finishes loading, calls queue on the fbq stub; on pages without
 * <MetaPixel /> (no stub), it simply no-ops.
 */
export function trackMetaEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  if (typeof fbq === "function") {
    fbq("track", event, params);
  }
}

export function MetaPixel() {
  // Bootstrap imperatively on mount rather than via next/script: this component
  // mounts late/conditionally (parents gate on i18n readiness), which defeats
  // next/script's afterInteractive registration. A useEffect always runs on mount.
  useEffect(() => {
    if (bootstrapped) return;
    bootstrapped = true;

    const w = window as unknown as { fbq?: Fbq; _fbq?: Fbq };

    if (!w.fbq) {
      // Stub that queues calls until fbevents.js loads and drains the queue —
      // this is what makes trackMetaEvent safe to call immediately on mount.
      const fbq = function (...args: unknown[]) {
        if (fbq.callMethod) {
          fbq.callMethod(...args);
        } else {
          fbq.queue.push(args);
        }
      } as Fbq;
      fbq.queue = [];
      fbq.loaded = true;
      fbq.version = "2.0";
      fbq.push = fbq;
      w.fbq = fbq;
      if (!w._fbq) w._fbq = fbq;

      const script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      // CSP: under the production nonce policy this non-parser-inserted script
      // is already trusted via 'strict-dynamic' (CSP3), and CSP2 browsers fall
      // back to the connect.facebook.net host entry. Propagating the nonce is
      // belt-and-suspenders. Browsers hide the nonce content attribute after
      // parsing, so read it from the IDL property of an existing nonced script
      // (e.g. the theme bootstrap in the root layout).
      const nonced = document.querySelector<HTMLScriptElement>("script[nonce]");
      if (nonced?.nonce) script.nonce = nonced.nonce;
      document.head.appendChild(script);
    }

    w.fbq!("init", PIXEL_ID);
    w.fbq!("track", "PageView");
  }, []);

  return (
    <noscript>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  );
}
