import * as Sentry from "@sentry/nextjs";
import { forwardToDiscord } from "./src/lib/sentry-discord";

// Same privacy scrubbing as the node runtime: strip request bodies, cookies
// and credential headers before any event leaves the app.
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

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Scrub first, then ping Discord with the already-redacted event.
  async beforeSend(event) {
    const scrubbed = scrubEvent(event);
    await forwardToDiscord(scrubbed);
    return scrubbed;
  },

  enabled: process.env.NODE_ENV === "production",
});
