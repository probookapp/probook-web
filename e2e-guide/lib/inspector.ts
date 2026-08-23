import type { Page } from "@playwright/test";

/**
 * Watches the application while the guide walks through it.
 *
 * The chapters already touch every feature — that is what they are for. What
 * they could not do was *notice* anything that breaks no assertion. A cash
 * movement was refused with a 400 and an "Échec de l'enregistrement" toast for
 * weeks; the chapter went green anyway, because nothing asserted on it. It was
 * caught by a person watching the video.
 *
 * So the walk itself becomes the detector. Every failed request, every console
 * error, every error toast is collected as it happens and attributed to the
 * narration line that was on screen at the time, which is what turns "something
 * failed somewhere" into "this step is broken".
 */

export interface Anomaly {
  kind: "request" | "console" | "pageerror" | "toast" | "i18n";
  detail: string;
  /** The narration line showing when it happened — i.e. what the user was doing. */
  step: string;
}

/**
 * Noise that says nothing about the product.
 *
 * Deliberately short, and every entry earns its place: an allowlist is how a
 * detector quietly stops detecting.
 */
const IGNORED = [
  // The test environment has no valid Resend key; signup mails always fail.
  /\/api\/auth\/(signup|resend-verification)/,
  // Read before a session exists — the 401 is the expected answer, not a fault.
  /\/api\/auth\/me/,
  /\/api\/subscription\/current/,
  /\/api\/tenant\/subscription/,
  // Chrome asks for these whether or not they exist.
  /favicon|apple-touch-icon|\.map$/,
  // Third-party hosts we neither serve nor can fix. The Meta pixel logs its own
  // internal errors to an endpoint Chrome then blocks (ERR_BLOCKED_BY_ORB), and
  // it does so intermittently — which is worse than useless in a detector: it
  // fails a chapter for something that is not the product, on some runs only.
  /connect\.facebook\.net|facebook\.com/,
  // React's dev-only double-render warnings and Next's own instrumentation.
  /Download the React DevTools/,
  /\[Fast Refresh\]/,
];

const ignored = (text: string) => IGNORED.some((re) => re.test(text));

/** Lets the shared afterEach find the inspector attached to a page. */
const ATTACHED = new WeakMap<Page, Inspector>();

export function inspectorFor(page: Page): Inspector | undefined {
  return ATTACHED.get(page);
}

export class Inspector {
  readonly anomalies: Anomaly[] = [];
  private step = "(before the first caption)";

  private constructor(private readonly page: Page) {}

  static attach(page: Page): Inspector {
    const inspector = new Inspector(page);
    ATTACHED.set(page, inspector);

    page.on("response", (res) => {
      if (res.status() < 400) return;
      const url = res.url();
      if (ignored(url)) return;
      inspector.record("request", `${res.status()} ${url.replace(/^https?:\/\/[^/]+/, "")}`);
    });

    page.on("requestfailed", (req) => {
      const url = req.url();
      if (ignored(url)) return;
      // Navigations the test itself aborts are not product failures.
      const why = req.failure()?.errorText ?? "";
      if (/ERR_ABORTED/.test(why)) return;
      inspector.record("request", `${why} ${url.replace(/^https?:\/\/[^/]+/, "")}`);
    });

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (ignored(text)) return;
      // The browser logs a line for every failed request, without saying which.
      // The response handler above already saw the same failure *and* its URL,
      // so this one adds nothing and cannot be filtered by route.
      if (/^Failed to load resource:/.test(text)) return;
      inspector.record("console", text.slice(0, 200));
    });

    page.on("pageerror", (err) => {
      if (ignored(err.message)) return;
      inspector.record("pageerror", err.message.slice(0, 200));
    });

    return inspector;
  }

  /** Called by Tour.say, so an anomaly is tied to what the viewer was told. */
  atStep(caption: string) {
    this.step = caption;
  }

  private record(kind: Anomaly["kind"], detail: string) {
    // One line per distinct problem: a failing poll would otherwise bury the rest.
    if (this.anomalies.some((a) => a.kind === kind && a.detail === detail)) return;
    this.anomalies.push({ kind, detail, step: this.step });
  }

  /**
   * Error notices visible on screen. A toast is the application telling the user
   * something went wrong; if one is showing, the step did not work, whatever the
   * assertions say.
   */
  async sweepToasts() {
    const messages = await this.page
      .locator('[role="alert"]')
      .filter({ visible: true })
      .allInnerTexts()
      .catch(() => [] as string[]);

    for (const raw of messages) {
      const text = raw.replace(/\s+/g, " ").trim();
      if (!text) continue;
      // Only failures: the same element carries "saved" and "sent" as well.
      if (!/échec|erreur|failed|error|impossible|فشل|خطأ/i.test(text)) continue;
      this.record("toast", text.slice(0, 160));
    }
  }

  /**
   * Keys i18next could not resolve since the last sweep.
   *
   * The chapters are the only thing that opens every modal, drawer and empty
   * state in all three languages, which makes them the only place a computed
   * key like `t(`pos:${method}`)` is ever exercised with real values. The list
   * is filled by the application itself (src/i18n/index.ts) and drained here,
   * so a key is attributed to the step that asked for it.
   */
  async sweepMissingKeys() {
    const missing = await this.page
      .evaluate(() => {
        const found = window.__I18N_MISSING__ ?? [];
        window.__I18N_MISSING__ = [];
        return found;
      })
      .catch(() => [] as string[]);

    for (const key of missing) this.record("i18n", `unresolved key ${key}`);
  }

  /** A readable account for the test to fail with. */
  report(): string {
    return this.anomalies
      .map((a) => `  [${a.kind}] ${a.detail}\n     during: ${a.step}`)
      .join("\n");
  }
}
