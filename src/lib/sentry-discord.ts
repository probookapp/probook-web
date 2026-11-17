import type { ErrorEvent } from "@sentry/nextjs";

// ========== Sentry → Discord forwarder ==========
// Called from the server and edge Sentry `beforeSend`, after scrubbing, so
// bodies, cookies and credential headers are already gone. Sentry receives
// the event unchanged whatever happens here: a failed post never throws.
//
// Guards, so a crash loop or a crawler cannot flood the channel:
// - only production events: a developer running the app locally with the
//   webhook in their .env paged the alerts channel with every local error
//   (labelled "development"), and previews would do the same;
// - only events at level "error" or "fatal";
// - none whose request came from a known crawler;
// - each fingerprint once per window, and at most MAX_PER_WINDOW distinct
//   issues per window (per server instance — good enough for a ping).

export const WINDOW_MS = 10 * 60 * 1000;
export const MAX_PER_WINDOW = 5;
const POST_TIMEOUT_MS = 3000;

const CRAWLER_UA =
  /bot\b|bingbot|googlebot|crawler|spider|slurp|duckduckbot|baiduspider|yandex|facebookexternalhit|ahrefs|semrush|petalbot|bytespider|gptbot|claudebot|applebot/i;

let windowStart = 0;
const seenInWindow = new Set<string>();

/** Test hook: forget what was sent. */
export function resetDiscordForwarder() {
  windowStart = 0;
  seenInWindow.clear();
}

function headerValue(event: ErrorEvent, name: string): string | undefined {
  const headers = event.request?.headers;
  if (!headers) return undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

function eventKey(event: ErrorEvent): string {
  if (event.fingerprint?.length && !event.fingerprint.includes("{{ default }}")) {
    return event.fingerprint.join("|");
  }
  const ex = event.exception?.values?.[0];
  const frames = ex?.stacktrace?.frames;
  const top = frames?.[frames.length - 1];
  return [ex?.type, ex?.value ?? event.message, top?.filename, top?.function].join("|");
}

/** The environment the alert shows: Sentry's, else Vercel's. */
function eventEnvironment(event: ErrorEvent): string | undefined {
  return event.environment ?? process.env.VERCEL_ENV;
}

/** Whether this event should be posted now; records it when it should. */
export function shouldForward(event: ErrorEvent, now = Date.now()): boolean {
  // Local runs and previews must never page the alerts channel.
  if (eventEnvironment(event) !== "production") return false;
  if (event.level && event.level !== "error" && event.level !== "fatal") return false;
  const ua = headerValue(event, "user-agent");
  if (ua && CRAWLER_UA.test(ua)) return false;

  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    seenInWindow.clear();
  }
  const key = eventKey(event);
  if (seenInWindow.has(key) || seenInWindow.size >= MAX_PER_WINDOW) return false;
  seenInWindow.add(key);
  return true;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function buildDiscordPayload(event: ErrorEvent) {
  const ex = event.exception?.values?.[0];
  const title = truncate(`${ex?.type ?? "Error"}: ${ex?.value ?? event.message ?? "(no message)"}`, 250);

  const frames = (ex?.stacktrace?.frames ?? []).filter((f) => f.in_app !== false).slice(-5).reverse();
  const stack = frames
    .map((f) => `at ${f.function ?? "?"} (${f.filename ?? "?"}:${f.lineno ?? "?"})`)
    .join("\n");

  const fields: { name: string; value: string; inline?: boolean }[] = [];
  const env = eventEnvironment(event);
  if (env) fields.push({ name: "Env", value: env, inline: true });
  if (event.release) fields.push({ name: "Release", value: truncate(event.release, 40), inline: true });
  if (event.request?.method || event.request?.url) {
    let path = event.request?.url ?? "";
    try {
      path = new URL(path).pathname;
    } catch {
      // keep as is
    }
    fields.push({ name: "Request", value: truncate(`${event.request?.method ?? ""} ${path}`.trim(), 200) });
  } else if (event.transaction) {
    fields.push({ name: "Transaction", value: truncate(event.transaction, 200) });
  }
  if (stack) fields.push({ name: "Stack", value: truncate("```\n" + stack, 1020) + "\n```" });

  const org = process.env.SENTRY_ORG;
  const url = org && event.event_id
    ? `https://${org}.sentry.io/issues/?query=${event.event_id}`
    : undefined;

  return {
    username: "Sentry",
    embeds: [
      {
        title,
        url,
        color: event.level === "fatal" ? 0x8b0000 : 0xe03e2f,
        fields,
        footer: event.event_id ? { text: `event ${event.event_id}` } : undefined,
        timestamp: new Date((event.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
      },
    ],
  };
}

/** Post the event to DISCORD_ALERT_WEBHOOK_URL when set and the guards allow. Never throws. */
export async function forwardToDiscord(event: ErrorEvent): Promise<void> {
  const webhook = process.env.DISCORD_ALERT_WEBHOOK_URL;
  if (!webhook) return;
  try {
    if (!shouldForward(event)) return;
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscordPayload(event)),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
  } catch {
    // A Discord outage must never affect error reporting or the request.
  }
}
