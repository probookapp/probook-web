import fs from "fs";
import path from "path";
import { type Page, type Locator, type TestInfo, expect, test } from "@playwright/test";
import { LOCALE, narrate } from "./locale";
import { Inspector } from "./inspector";
import { t } from "./i18n";

export { LOCALE } from "./locale";

/**
 * GUIDE_SHOTS=1: take the guide's screenshots while the chapters run.
 *
 * The chapters are the written guide's source as well as the UI test suite.
 * Each `say()` is a step of the guide — its sentence is printed on the
 * /guide pages (scripts/build-guide-content.mjs) — and, in this mode, the
 * screen as that step leaves it is captured beside it. What the guide shows is
 * therefore, by construction, what the test just verified.
 *
 * Without it, the same chapters run as plain tests: same clicks, same
 * assertions, no files written.
 */
export const SHOTS = process.env.GUIDE_SHOTS === "1";

const ROOT = path.resolve(__dirname, "..", "..");

/** Lets the shared fixture close the chapter: last screenshot, inspector. */
const OPEN_TOURS = new WeakMap<Page, Tour>();

export function tourFor(page: Page): Tour | undefined {
  return OPEN_TOURS.get(page);
}

/**
 * Everything that must exist before the first navigation:
 *  - a service-worker stub (the real worker claims the page and reloads it,
 *    which would cut a chapter mid-action),
 *  - popup + print suppression (the POS receipt opens a blank window and calls
 *    print(), which steals focus from the chapter),
 *  - the Next.js dev badge hidden, so it is never in a screenshot.
 *
 * Must be called before page.goto — addInitScript only applies to later loads.
 */
export async function installTourRuntime(page: Page) {
  await page.addInitScript(() => {
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

    window.print = () => {};
    const nativeOpen = window.open.bind(window);
    window.open = ((url?: string | URL, ...rest: unknown[]) =>
      url ? (nativeOpen as never as (...a: unknown[]) => Window | null)(url, ...rest) : null) as typeof window.open;

    const install = () => {
      if (document.getElementById("__tour_style") || !document.head) return;
      const style = document.createElement("style");
      style.id = "__tour_style";
      style.textContent = `nextjs-portal, [data-nextjs-dev-tools-button], #__next-dev-tools-indicator,
        [data-nextjs-toast], nextjs-dev-tools-indicator {display:none !important}`;
      document.head.appendChild(style);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
    else install();
  });
}

/**
 * A chapter of the guide: its steps, and the interactions that carry them out.
 */
export class Tour {
  /** `label` is the chapter's short name ("4 · Devis"), kept with its screenshots. */
  constructor(
    readonly page: Page,
    readonly label: string
  ) {}

  /**
   * Watches the whole walk. The chapters touch every feature; this is what
   * makes them *notice* a failure that breaks no assertion — see inspector.ts.
   */
  readonly inspector!: Inspector;

  /**
   * The source (French) sentence of each step said so far, in order — the
   * screenshot NN.png belongs to said[NN]. Kept by text, not by position:
   * a chapter may skip a step (the till is already open), and the build script
   * then leaves that sentence without a picture instead of shifting the rest.
   */
  private readonly said: string[] = [];

  static async open(page: Page, label: string): Promise<Tour> {
    const inspector = Inspector.attach(page);
    await installTourRuntime(page);
    const tour = new Tour(page, narrate(label));
    (tour as { inspector: Inspector }).inspector = inspector;
    OPEN_TOURS.set(page, tour);
    return tour;
  }

  // ─── steps ───

  /**
   * Start a step of the guide. The previous step is over, so its screen is
   * captured first: a sentence describes what the actions after it do, and
   * the picture shows where they led.
   */
  async say(text: string) {
    // Resolved here, so a missing caption fails in seconds in any language.
    narrate(text);
    // Whatever went wrong belongs to the step just finished, and an error
    // notice raised by it is still on screen now.
    this.inspector?.atStep(text);
    await this.inspector?.sweepToasts();
    await this.inspector?.sweepMissingKeys();
    if (this.said.length > 0) await this.capture(this.said.length - 1);
    this.said.push(text);
  }

  /**
   * End of the chapter: the last step's screenshot, and the sentence each
   * screenshot belongs to, which the build script matches to the transcript.
   */
  async finish(testInfo: TestInfo) {
    if (!SHOTS) return;
    if (this.said.length > 0) await this.capture(this.said.length - 1);
    const dir = this.shotDir(testInfo);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "steps.json"), JSON.stringify({ chapter: this.label, said: this.said }, null, 1) + "\n");
  }

  /** guide-output/shots/<locale>/<desktop|mobile>/<chapter>/ */
  private shotDir(testInfo: TestInfo) {
    const suite = path.basename(path.dirname(testInfo.file)) === "e2e-guide" ? "desktop" : "mobile";
    const chapter = path.basename(testInfo.file, ".spec.ts");
    return path.join(ROOT, "guide-output", "shots", LOCALE, suite, chapter);
  }

  /** The screen as a step leaves it. */
  private async capture(index: number) {
    if (!SHOTS) return;
    await this.page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
    // A page still loading shows a spinner, not the step's result.
    await this.page
      .locator(".animate-spin")
      .filter({ visible: true })
      .first()
      .waitFor({ state: "hidden", timeout: 8_000 })
      .catch(() => {});
    // Dialogs fade and slide in; a toast slides up. Let them land.
    await this.page.waitForTimeout(450);

    const vp = this.page.viewportSize() ?? { width: 1440, height: 900 };
    const visible = (selector: string) =>
      this.page.locator(selector).filter({ visible: true }).last().boundingBox({ timeout: 500 }).catch(() => null);
    const inView = (b: { x: number; y: number; width: number; height: number }, margin: number) => {
      const x = Math.max(0, b.x - margin);
      const y = Math.max(0, b.y - margin);
      return {
        x,
        y,
        width: Math.min(vp.width, b.x + b.width + margin) - x,
        height: Math.min(vp.height, b.y + b.height + margin) - y,
      };
    };
    // An open dialog is the subject: the picture is the dialog itself. Otherwise
    // the page's content, without the sidebar — at the width of the guide's
    // column, the whole window would shrink the text past reading.
    const dialog = await visible('[role="dialog"]');
    const main = await visible("main");
    const clip =
      dialog && dialog.width * dialog.height < vp.width * vp.height * 0.8
        ? inView(dialog, 16)
        : main && main.width < vp.width - 40
          ? inView(main, 0)
          : undefined;

    const dir = this.shotDir(test.info());
    fs.mkdirSync(dir, { recursive: true });
    await this.page.screenshot({
      path: path.join(dir, `${String(index).padStart(2, "0")}.png`),
      clip,
      // Not "disabled": Playwright then cancels infinite animations and
      // replays them through the animation API, which detaches them from
      // their CSS class. A loading spinner's node, reused by React for the
      // page header once loaded, kept spinning — header and all.
      caret: "hide",
    });
  }

  /**
   * The chapter's title. The guide page has its own heading, so nothing is
   * shown; resolving the strings keeps a missing translation a failure.
   */
  async titleCard(title: string, subtitle: string) {
    narrate(title);
    narrate(subtitle);
  }

  /** Wait for a navigation to finish. */
  private async settle() {
    await this.page.waitForLoadState("domcontentloaded");
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }

  // ─── navigation ───

  async goto(route: string) {
    await this.page.goto(`/${LOCALE}/${route}`.replace(/\/+$/, ""));
    await this.settle();
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
      if (await hamburger.isVisible().catch(() => false)) await this.click(hamburger);
    }

    await this.click(link);
    await this.settle();
  }

  // ─── interaction ───

  /**
   * Wait for a target and bring it into view.
   *
   * Finding the element and scrolling to it are retried together: a list that
   * refetched between the two threw "Element is not attached to the DOM", and
   * because the chapters share one tenant, losing one chapter that way took
   * the following ones down with it.
   */
  async point(target: Locator) {
    const loc = target.first();
    for (let attempt = 0; ; attempt++) {
      try {
        await loc.waitFor({ state: "visible", timeout: attempt === 0 ? 30_000 : 8_000 });
        await loc.scrollIntoViewIfNeeded();
        // The pointer goes where a person's would: some affordances only show
        // on hover, and the chapters have always been verified that way.
        const box = await loc.boundingBox();
        if (box) await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        return loc;
      } catch (err) {
        if (attempt >= 2) throw err;
        await this.page.waitForTimeout(400);
      }
    }
  }

  async click(target: Locator) {
    const loc = await this.point(target);
    try {
      await loc.click();
    } catch (err) {
      // Same race, one step later: the row can remount between the wait and
      // the click. Look again and click once more before giving up.
      if (!String(err).includes("not attached")) throw err;
      await (await this.point(target)).click();
    }
  }

  async type(target: Locator, text: string, opts: { clear?: boolean } = {}) {
    const loc = await this.point(target);
    await loc.click();
    if (opts.clear !== false) await loc.fill("");
    await loc.fill(text);
  }

  /** Set a value in one shot (date pickers, long numbers). */
  async set(target: Locator, value: string) {
    const loc = await this.point(target);
    await loc.fill(value);
  }

  /** Native <select>, by value or by visible label. */
  async choose(target: Locator, value: string | { label: string } | { value: string }) {
    const loc = await this.point(target);
    await loc.selectOption(value);
  }

  /**
   * The app's SearchableSelect: a trigger button that opens a filter input and
   * a role=listbox. `root` is the wrapper div holding both.
   */
  async pick(root: Locator, optionText: string, opts: { search?: string } = {}) {
    await this.click(root.locator("button").first());
    if (opts.search) {
      await root.locator('input[type="text"]').first().fill(opts.search);
      await this.page.waitForTimeout(400);
    }
    await this.click(this.page.locator('li[role="option"]').filter({ hasText: optionText }).first());
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
    return this.page.getByRole("row").filter({ hasText: text }).filter({ visible: true }).first();
  }

  /** An icon-only action inside a given row, matched on its aria-label. */
  rowAction(rowText: string, label: string): Locator {
    return this.row(rowText).locator(`[aria-label="${label}"], [title="${label}"]`).first();
  }

  /**
   * Run a list action wherever the list keeps it: the icon beside the menu when
   * it is the primary action, otherwise an item of the "⋯" menu.
   */
  async clickAction(label: string) {
    const inline = this.action(label);
    if (await inline.count()) {
      await this.click(inline);
      return;
    }
    // Phone lists fold the rarer actions into "⋯" too. Looked for inside the
    // card list: the page header has a "⋯" of its own, above the cards.
    const more = t("common:buttons.moreActions");
    const cardMenu = this.page
      .locator("main .md\\:hidden.divide-y")
      .locator(`[aria-label="${more}"], [title="${more}"]`)
      .filter({ visible: true })
      .first();
    await this.click(cardMenu);
    await this.click(
      this.page.getByRole("menuitem", { name: label, exact: true }).filter({ visible: true }).first()
    );
  }

  /** As clickAction, inside the desktop table row containing `rowText`. */
  async clickRowAction(rowText: string, label: string) {
    const inline = this.rowAction(rowText, label);
    if (await inline.count()) {
      await this.click(inline);
      return;
    }
    await this.click(this.rowAction(rowText, t("common:buttons.moreActions")));
    await this.click(
      this.page.getByRole("menuitem", { name: label, exact: true }).filter({ visible: true }).first()
    );
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

  /** Wait for a toast; never fails the chapter over one (they auto-dismiss). */
  async expectToast() {
    const toast = this.page.locator("[role='status'], .toast, [data-toast]").first();
    await expect(toast).toBeVisible({ timeout: 4000 }).catch(() => {});
  }
}
