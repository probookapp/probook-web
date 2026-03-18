"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

let initialized = false;

export function SentryProvider() {
  useEffect(() => {
    if (initialized) return;
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      replaysSessionSampleRate: 0.01,
      replaysOnErrorSampleRate: 1.0,
      integrations: [
        Sentry.replayIntegration(),
        Sentry.browserTracingIntegration(),
      ],
      enabled: process.env.NODE_ENV === "production",
    });

    initialized = true;
  }, []);

  return null;
}
