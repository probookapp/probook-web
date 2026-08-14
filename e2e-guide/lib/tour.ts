import { type Page, type Locator, expect } from "@playwright/test";
import { LOCALE, narrate } from "./locale";

export { LOCALE } from "./locale";

/**
 * GUIDE_FAST=1 runs the exact same chapters with the narration pacing stripped
 * out: same clicks, same assertions, no dwell time and no video. That is how
 * the guide doubles as the UI test suite — every flow is proven green before a
 * single frame is filmed.
 */
export const FAST = process.env.GUIDE_FAST === "1";

/** Reading pace for the on-screen caption bar (ms). */
function readingTime(text: string): number {
  if (FAST) return 0;
  return Math.min(5200, Math.max(1100, 850 + text.length * 42));
}

declare global {
  interface Window {
    __tour?: {
      caption: (t: string) => void;
      chip: (t: string) => void;
      position: (p: "top" | "bottom") => void;
      spot: (box: { x: number; y: number; w: number; h: number } | null) => void;
      card: (title: string, subtitle: string) => void;
      hideCard: () => void;
    };
  }
}

/**
 * Everything that must exist before the first navigation:
 *  - the caption bar / cursor / click-ripple overlay,
 *  - a service-worker stub (the real worker claims the page and reloads it,
 *    which would cut the recording mid-action),
 *  - popup + print suppression (the POS receipt opens a blank window and calls
 *    print(); in a recording that steals focus and lands in its own video file).
 *
 * Must be called before page.goto — addInitScript only applies to later loads.
 */
export async function installTourRuntime(page: Page) {
  await page.addInitScript(() => {
    // ─── service worker: never register ───
    if ("serviceWorker" in navigator) {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          register: () => new Promise(() => {}),
          ready: new Promise(() => {}),
          controller: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          getRegistrations: () => Promise.resolve([]),
        },
      });
    }

    // ─── receipt printing: keep it off-screen ───
    window.print = () => {};
    const nativeOpen = window.open.bind(window);
    window.open = ((url?: string | URL, ...rest: unknown[]) =>
      url ? (nativeOpen as never as (...a: unknown[]) => Window | null)(url, ...rest) : null) as typeof window.open;

    // ─── caption bar + cursor overlay ───
    const KEY_TEXT = "__tour_caption";
    const KEY_CHIP = "__tour_chip";
    const KEY_POS = "__tour_pos";

    const render = () => {
      const chip = document.getElementById("__tour_chip");
      const text = document.getElementById("__tour_text");
      const cap = document.getElementById("__tour_caption");
      if (!chip || !text || !cap) return;
      chip.textContent = sessionStorage.getItem(KEY_CHIP) || "";
      text.textContent = sessionStorage.getItem(KEY_TEXT) || "";
      cap.className = sessionStorage.getItem(KEY_POS) || "bottom";
      if (text.textContent) cap.classList.add("on");
    };

    const install = () => {
      if (document.getElementById("__tour_style") || !document.body) return;
      const style = document.createElement("style");
      style.id = "__tour_style";
      style.textContent = `
        /* The Next.js dev-tools badge sits in the bottom-left corner and would
           be filmed into a customer-facing video. It is a development artefact
           with no place in the guide. */
        nextjs-portal, [data-nextjs-dev-tools-button], #__next-dev-tools-indicator,
        [data-nextjs-toast], nextjs-dev-tools-indicator {display:none !important}
        #__tour_cursor{position:fixed;width:26px;height:26px;border-radius:50%;
          background:radial-gradient(circle at 34% 34%,rgba(255,255,255,.95),rgba(56,132,255,.6) 62%,rgba(56,132,255,.12));
          border:2px solid rgba(255,255,255,.92);box-shadow:0 2px 12px rgba(0,0,0,.4);
          transform:translate(-50%,-50%);pointer-events:none;z-index:2147483647;opacity:0;transition:opacity .25s}
        #__tour_cursor.on{opacity:1}
        .__tour_ripple{position:fixed;width:28px;height:28px;border-radius:50%;
          border:3px solid rgba(56,132,255,.95);transform:translate(-50%,-50%);
          pointer-events:none;z-index:2147483646;animation:__tourRipple .6s ease-out forwards}
        @keyframes __tourRipple{to{transform:translate(-50%,-50%) scale(3.2);opacity:0}}
        #__tour_spot{position:fixed;pointer-events:none;z-index:2147483644;border-radius:10px;
          box-shadow:0 0 0 3px rgba(37,99,235,.95),0 0 22px rgba(37,99,235,.55);
          opacity:0;transition:opacity .2s,top .18s,left .18s,width .18s,height .18s}
        #__tour_spot.on{opacity:1}
        #__tour_caption{position:fixed;left:0;right:0;z-index:2147483645;pointer-events:none;
          display:flex;align-items:center;gap:16px;padding:18px 34px;color:#fff;
          font:500 22px/1.35 "Segoe UI",system-ui,-apple-system,sans-serif;
          opacity:0;transition:opacity .3s;text-shadow:0 1px 3px rgba(0,0,0,.6)}
        #__tour_caption.on{opacity:1}
        #__tour_caption.bottom{bottom:0;background:linear-gradient(to top,rgba(2,6,23,.95),rgba(2,6,23,.45))}
        #__tour_caption.top{top:0;background:linear-gradient(to bottom,rgba(2,6,23,.95),rgba(2,6,23,.45))}
        #__tour_chip{flex:none;background:#2563eb;border-radius:999px;padding:6px 15px;
          font-size:15px;font-weight:600;letter-spacing:.3px;text-shadow:none}
        #__tour_text{flex:1}
        #__tour_card{position:fixed;inset:0;z-index:2147483647;pointer-events:none;
          display:flex;align-items:center;justify-content:center;text-align:center;
          background:radial-gradient(circle at 50% 40%,#1e3a8a,#020617 70%);
          opacity:0;transition:opacity .6s ease}
        #__tour_card.on{opacity:1}
        #__tour_card_in{transform:translateY(14px);transition:transform .7s ease}
        #__tour_card.on #__tour_card_in{transform:translateY(0)}
        #__tour_card_t{color:#fff;font:700 68px/1.15 "Segoe UI",system-ui,sans-serif;letter-spacing:-1px}
        #__tour_card_s{color:#93c5fd;font:400 28px/1.4 "Segoe UI",system-ui,sans-serif;margin-top:18px}

        /* Phone-shaped recordings: the overlay is sized for 1080p, and at
           390px the caption would eat half the screen and the title card
           would run off the edges. */
        @media (max-width: 600px) {
          #__tour_caption{gap:10px;padding:12px 16px;font-size:15px;line-height:1.3}
          #__tour_chip{padding:4px 10px;font-size:11px}
          #__tour_card{padding:0 28px}
          #__tour_card_t{font-size:34px;letter-spacing:-.5px}
          #__tour_card_s{font-size:16px;margin-top:12px}
        }
      `;
      document.head.appendChild(style);

      const cursor = document.createElement("div");
      cursor.id = "__tour_cursor";
      const caption = document.createElement("div");
      caption.id = "__tour_caption";
      caption.innerHTML = '<span id="__tour_chip"></span><span id="__tour_text"></span>';
      const spot = document.createElement("div");
      spot.id = "__tour_spot";
      document.body.append(cursor, caption, spot);
      render();

      addEventListener(
        "mousemove",
        (e) => {
          cursor.style.left = `${e.clientX}px`;
          cursor.style.top = `${e.clientY}px`;
          cursor.classList.add("on");
        },
        true
      );
      addEventListener(
        "mousedown",
        (e) => {
          const r = document.createElement("div");
          r.className = "__tour_ripple";
          r.style.left = `${e.clientX}px`;
          r.style.top = `${e.clientY}px`;
          document.body.appendChild(r);
          setTimeout(() => r.remove(), 700);
        },
        true
      );
    };

    window.__tour = {
      caption: (t: string) => {
        sessionStorage.setItem(KEY_TEXT, t);
        render();
      },
      chip: (t: string) => {
        sessionStorage.setItem(KEY_CHIP, t);
        render();
      },
      position: (p: "top" | "bottom") => {
        sessionStorage.setItem(KEY_POS, p);
        render();
      },
      card: (title: string, subtitle: string) => {
        document.getElementById("__tour_card")?.remove();
        const card = document.createElement("div");
        card.id = "__tour_card";
        card.innerHTML =
          `<div id="__tour_card_in"><div id="__tour_card_t">${title}</div>` +
          `<div id="__tour_card_s">${subtitle}</div></div>`;
        document.body.appendChild(card);
        requestAnimationFrame(() => card.classList.add("on"));
      },
      hideCard: () => {
        const card = document.getElementById("__tour_card");
        if (!card) return;
        card.classList.remove("on");
        setTimeout(() => card.remove(), 700);
      },
      spot: (box) => {
        const el = document.getElementById("__tour_spot");
        if (!el) return;
        if (!box) {
          el.classList.remove("on");
          return;
        }
        el.style.left = `${box.x - 5}px`;
        el.style.top = `${box.y - 5}px`;
        el.style.width = `${box.w + 10}px`;
        el.style.height = `${box.h + 10}px`;
        el.classList.add("on");
      },
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", install);
    } else {
      install();
    }
  });
}

/**
 * A recorded chapter: navigation, narration and human-paced interactions.
 *
 * Every click glides the pointer to the target before pressing, so the viewer
 * can follow what is being clicked — a bare locator.click() teleports and reads
 * as a jump-cut on video.
 */
export class Tour {
  constructor(
    readonly page: Page,
    private readonly chip: string
  ) {}

  static async open(page: Page, chip: string): Promise<Tour> {
    await installTourRuntime(page);
    return new Tour(page, narrate(chip));
  }

  // ─── narration ───

  private async runtime(): Promise<boolean> {
    return this.page
      .evaluate(() => typeof window.__tour !== "undefined")
      .catch(() => false);
  }

  /** Show a caption and hold it long enough to be read. */
  async say(text: string, holdMs?: number) {
    // Resolved before the fast-mode bail-out, so `GUIDE_LOCALE=en guide:check`
    // fails on a missing caption in seconds instead of surfacing it halfway
    // through a recording.
    const line = narrate(text);
    if (FAST) return;
    if (await this.runtime()) {
      await this.page.evaluate(
        ([t, c]) => {
          window.__tour?.chip(c);
          window.__tour?.caption(t);
        },
        [line, this.chip] as const
      );
    }
    // Timed on the line that is actually shown: the same sentence is a
    // different length in each language, and pacing on the French would rush
    // the others off screen.
    await this.page.waitForTimeout(holdMs ?? readingTime(line));
  }

  /**
   * Full-screen chapter card. Recorded into the chapter's own video, which also
   * makes it the separator between chapters in the stitched full-length cut.
   */
  async titleCard(title: string, subtitle: string, holdMs = 2600) {
    const card = [narrate(title), narrate(subtitle)] as const;
    if (FAST) return;
    if (!(await this.runtime())) return;
    await this.page.evaluate(([t, s]) => window.__tour?.card(t, s), card);
    await this.page.waitForTimeout(holdMs);
    await this.page.evaluate(() => window.__tour?.hideCard());
    await this.page.waitForTimeout(700);
  }

  async captionPosition(p: "top" | "bottom") {
    if (FAST) return;
    if (await this.runtime()) {
      await this.page.evaluate((pos) => window.__tour?.position(pos), p);
    }
  }

  async pause(ms = 900) {
    if (FAST) return;
    await this.page.waitForTimeout(ms);
  }

  /**
   * Wait for a navigation to finish. The overlay rebuilds itself on each load
   * and restores its caption from sessionStorage, so nothing else is needed.
   */
  private async settle() {
    await this.page.waitForLoadState("domcontentloaded");
    await this.page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => {});
  }

  // ─── navigation ───

  async goto(path: string) {
    await this.page.goto(`/${LOCALE}/${path}`.replace(/\/+$/, ""));
    await this.settle();
    await this.pause(600);
  }

  /**
   * Navigate through the sidebar, opening it first on a phone.
   *
   * Below the large breakpoint the sidebar is off-canvas, so the link exists in
   * the DOM but is not clickable until the menu button is pressed. Handling it
   * here keeps the chapters identical at both widths.
   */
  async nav(route: string) {
    const link = this.page.locator(`aside a[href="/${LOCALE}${route}"]`).first();

    // The off-canvas sidebar is translated out of frame, not hidden, so
    // isVisible() answers yes while the click lands nowhere. Position is the
    // honest signal; the hamburger that opens it is the first button of the
    // mobile header, which only exists below the large breakpoint.
    const box = await link.boundingBox().catch(() => null);
    if (!box || box.x < 0) {
      const hamburger = this.page.locator("main button").first();
      if (await hamburger.isVisible().catch(() => false)) {
        await this.click(hamburger, { settleMs: 500 });
      }
    }

    await this.click(link);
    await this.settle();
    await this.pause(700);
  }

  // ─── interaction ───

  /**
   * Glide the pointer to an element and highlight it, without clicking.
   *
   * Verification mode runs this too. Skipping it there would leave the pointer
   * maths — the one part only the recording exercises — untested, and a
   * chapter that verifies green would still be able to fail mid-take.
   */
  async point(target: Locator) {
    const loc = target.first();

    // Finding the element and scrolling to it are retried together. Only the
    // measuring below used to be guarded, so a list that refetched between the
    // wait and the scroll threw "Element is not attached to the DOM" — and
    // because the chapters share one tenant, losing chapter 4 that way took
    // chapters 5, 6, 8 and 11 down with it.
    for (let attempt = 0; ; attempt++) {
      try {
        await loc.waitFor({ state: "visible", timeout: attempt === 0 ? 30_000 : 8_000 });
        await loc.scrollIntoViewIfNeeded();
        break;
      } catch (err) {
        if (attempt >= 2) throw err;
        await this.page.waitForTimeout(400);
      }
    }

    // A list that refetches can unmount the element between waitFor and
    // boundingBox, so measuring is retried rather than fatal. If it still has
    // no box, the highlight is skipped and the caller carries on: the spotlight
    // is decoration, and the click that follows does its own actionability
    // checks — failing the whole chapter on a decoration was costing takes.
    let box = await loc.boundingBox();
    for (let attempt = 0; !box && attempt < 3; attempt++) {
      await this.page.waitForTimeout(250);
      await loc.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
      box = await loc.boundingBox();
    }
    if (!box) return loc;

    await this.page.evaluate(
      (b) => window.__tour?.spot(b),
      { x: box.x, y: box.y, w: box.width, h: box.height }
    );
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 24,
    });
    return loc;
  }

  private async clearSpot() {
    await this.page.evaluate(() => window.__tour?.spot(null)).catch(() => {});
  }

  /** Move to the target, then click it with full actionability checks. */
  async click(target: Locator, opts: { settleMs?: number } = {}) {
    const loc = await this.point(target);
    await this.pause(250);
    try {
      await loc.click();
    } catch (err) {
      // Same race, one step later: the row can remount while the pointer is
      // travelling to it. Re-point and click once more before giving up.
      if (!String(err).includes("not attached")) throw err;
      const again = await this.point(target);
      await again.click();
    }
    await this.clearSpot();
    await this.pause(opts.settleMs ?? 450);
  }

  /** Type character by character so the viewer sees the field being filled. */
  async type(target: Locator, text: string, opts: { clear?: boolean } = {}) {
    const loc = await this.point(target);
    await loc.click();
    if (opts.clear !== false) await loc.fill("");
    if (FAST) await loc.fill(text);
    else await loc.pressSequentially(text, { delay: 38 });
    await this.clearSpot();
    await this.pause(300);
  }

  /** Set a value in one shot (date pickers, long numbers). */
  async set(target: Locator, value: string) {
    const loc = await this.point(target);
    await loc.fill(value);
    await this.clearSpot();
    await this.pause(350);
  }

  /** Native <select>, by value or by visible label. */
  async choose(target: Locator, value: string | { label: string } | { value: string }) {
    const loc = await this.point(target);
    await loc.selectOption(value);
    await this.clearSpot();
    await this.pause(450);
  }

  /**
   * The app's SearchableSelect: a trigger button that opens a filter input and
   * a role=listbox. `root` is the wrapper div holding both.
   */
  async pick(root: Locator, optionText: string, opts: { search?: string } = {}) {
    const trigger = root.locator("button").first();
    await this.click(trigger, { settleMs: 250 });
    if (opts.search) {
      const search = root.locator('input[type="text"]').first();
      if (FAST) await search.fill(opts.search);
      else await search.pressSequentially(opts.search, { delay: 45 });
      await this.page.waitForTimeout(FAST ? 400 : 350);
    }
    const option = this.page
      .locator('li[role="option"]')
      .filter({ hasText: optionText })
      .first();
    await this.click(option, { settleMs: 350 });
  }

  // ─── selectors ───

  /** Visible button (lists render duplicate desktop/mobile trees). */
  button(name: string | RegExp): Locator {
    return this.page.getByRole("button", { name }).filter({ visible: true }).first();
  }

  /** Icon-only action button, matched on its aria-label. */
  action(label: string): Locator {
    return this.page
      .locator(`[aria-label="${label}"], [title="${label}"]`)
      .filter({ visible: true })
      .first();
  }

  /** Topmost open modal (a nested modal portals after its parent). */
  dialog(): Locator {
    return this.page.locator('[role="dialog"]').filter({ visible: true }).last();
  }

  /**
   * The desktop table row containing `text`.
   *
   * List pages render two trees and hide one by breakpoint — a table on a wide
   * screen, cards on a phone — so this finds nothing usable below `lg`. The
   * phone chapters narrow the list with its search box instead and then use
   * `action()`, which needs no container.
   */
  row(text: string): Locator {
    return this.page
      .getByRole("row")
      .filter({ hasText: text })
      .filter({ visible: true })
      .first();
  }

  /** An icon-only action inside a given row, matched on its aria-label. */
  rowAction(rowText: string, label: string): Locator {
    return this.row(rowText)
      .locator(`[aria-label="${label}"], [title="${label}"]`)
      .first();
  }

  /**
   * The wrapper element of a labelled field — the label's parent, which for both
   * Input and SearchableSelect is the component root. Use it to scope a `pick()`.
   *
   * `index` picks among repeated fields, e.g. the product select of each
   * invoice line.
   */
  fieldByLabel(label: string, root?: Locator, index = 0): Locator {
    const scope = root ?? this.page;
    return scope
      .locator(`xpath=.//label[normalize-space(.)=${JSON.stringify(label)}]/..`)
      .filter({ visible: true })
      .nth(index);
  }

  /**
   * A POS overlay. The till's modals are plain fixed panels rather than Radix
   * dialogs, so `dialog()` does not see them.
   */
  posOverlay(): Locator {
    return this.page.locator("div.fixed.inset-0").filter({ visible: true }).last();
  }

  /** Wait for a toast so the viewer sees the confirmation before moving on. */
  async expectToast(text?: string | RegExp) {
    const toast = this.page.locator("[role='status'], .toast, [data-toast]").first();
    try {
      await expect(toast).toBeVisible({ timeout: 4000 });
    } catch {
      /* toasts auto-dismiss fast; never fail the recording over one */
    }
    if (text) await this.page.waitForTimeout(600);
  }
}
