import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import {
  MAX_PER_WINDOW,
  WINDOW_MS,
  buildDiscordPayload,
  forwardToDiscord,
  resetDiscordForwarder,
  shouldForward,
} from "../sentry-discord";

function errorEvent(value: string, extra: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    type: undefined,
    level: "error",
    event_id: "abc123",
    exception: {
      values: [
        {
          type: "TypeError",
          value,
          stacktrace: { frames: [{ filename: "app/route.ts", function: "GET", lineno: 12, in_app: true }] },
        },
      ],
    },
    ...extra,
  } as ErrorEvent;
}

describe("shouldForward", () => {
  beforeEach(() => resetDiscordForwarder());

  it("skips levels below error", () => {
    expect(shouldForward(errorEvent("x", { level: "warning" }))).toBe(false);
    expect(shouldForward(errorEvent("x", { level: "fatal" }))).toBe(true);
  });

  it("skips crawler requests", () => {
    const event = errorEvent("x", {
      request: { headers: { "User-Agent": "Mozilla/5.0 (compatible; bingbot/2.0)" } },
    });
    expect(shouldForward(event)).toBe(false);
  });

  it("sends a fingerprint once per window", () => {
    expect(shouldForward(errorEvent("boom"), 0)).toBe(true);
    expect(shouldForward(errorEvent("boom"), 1000)).toBe(false);
    expect(shouldForward(errorEvent("boom"), WINDOW_MS)).toBe(true);
  });

  it("caps distinct issues per window", () => {
    for (let i = 0; i < MAX_PER_WINDOW; i++) {
      expect(shouldForward(errorEvent(`e${i}`), 0)).toBe(true);
    }
    expect(shouldForward(errorEvent("one more"), 0)).toBe(false);
  });
});

describe("buildDiscordPayload", () => {
  it("builds an embed with title, request path and stack", () => {
    const payload = buildDiscordPayload(
      errorEvent("cannot read x", {
        environment: "production",
        request: { method: "POST", url: "https://www.example.test/api/invoices?id=1" },
      }),
    );
    const embed = payload.embeds[0];
    expect(embed.title).toBe("TypeError: cannot read x");
    expect(embed.fields).toContainEqual({ name: "Request", value: "POST /api/invoices" });
    expect(embed.fields.find((f) => f.name === "Stack")?.value).toContain("GET (app/route.ts:12)");
  });
});

describe("forwardToDiscord", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetDiscordForwarder();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does nothing without a webhook", async () => {
    vi.stubEnv("DISCORD_ALERT_WEBHOOK_URL", "");
    await forwardToDiscord(errorEvent("x"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the webhook and swallows failures", async () => {
    vi.stubEnv("DISCORD_ALERT_WEBHOOK_URL", "https://discord.test/hook");
    fetchMock.mockRejectedValue(new Error("down"));
    await expect(forwardToDiscord(errorEvent("x"))).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("https://discord.test/hook", expect.objectContaining({ method: "POST" }));
  });
});
