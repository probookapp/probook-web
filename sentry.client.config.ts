import * as Sentry from "@sentry/nextjs";

// This is a financial/POS app: client names, invoice amounts and cash counts
// appear on screen and in requests. Strip request bodies, cookies and
// credential headers before any event leaves the app — the error itself,
// route and tags are kept.
const SENSITIVE_HEADERS = ["authorization", "cookie", "set-cookie", "x-api-key"];

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
          delete event.request.headers[key];
        }
      }
    }
  }
  return event;
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring: sample 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session replay: capture 1% of sessions, 100% of sessions with errors
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    // Mask everything in replays: screens routinely show client names,
    // invoice amounts and cash counts.
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
    Sentry.browserTracingIntegration(),
  ],

  beforeSend(event) {
    return scrubEvent(event);
  },

  // Don't send events in development
  enabled: process.env.NODE_ENV === "production",
});
