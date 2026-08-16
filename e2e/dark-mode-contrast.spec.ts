import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

/**
 * Reads every screen in the dark theme and reports text nobody can read.
 *
 * The identity defines two kinds of colour. The semantic tokens
 * (`--color-text-primary`, `--color-bg-primary`) are redefined under `.dark`,
 * so anything using them follows the theme on its own. The numeric ramps
 * (`gray-500`, `blue-600`) are not: they are the same value in both themes, so
 * every use of one owes the stylesheet an explicit `dark:` counterpart.
 *
 * Nothing enforces that. 201 elements use a ramp with no dark variant, and
 * grepping cannot tell which of them are wrong — a `text-gray-900` inside a
 * container that is light in both themes is perfectly fine. Only the rendered
 * page knows.
 *
 * So this measures. Every visible run of text, its computed colour against the
 * nearest painted background behind it, as a WCAG contrast ratio. Below 3:1
 * nobody reads it comfortably, and below that the failure is usually total —
 * dark grey on near-black.
 */

const ROUTES = [
  // The public pages first: they are what a visitor whose machine is dark sees
  // before the application has any say in it.
  "/fr",
  "/fr/pricing",
  "/fr/login",
  "/fr/signup",
  "/fr/dashboard",
  "/fr/clients",
  "/fr/products",
  "/fr/quotes",
  "/fr/invoices",
  "/fr/delivery-notes",
  "/fr/expenses",
  "/fr/purchases",
  "/fr/suppliers",
  "/fr/locations",
  "/fr/reports",
  "/fr/settings",
  "/fr/pos",
];

/** Below this, text on its own background is not comfortably readable. */
const MIN_RATIO = 3;

interface LowContrast {
  text: string;
  color: string;
  background: string;
  ratio: number;
  tag: string;
}

test.describe("dark mode", () => {
  test("no screen renders text that cannot be read on its own background", async ({ page }) => {
    await signUp(page);

    // The preference the application itself stores, so the class-based `dark:`
    // utilities apply — emulateMedia alone only flips the token media query,
    // which is exactly the mismatch this suite exists to catch.
    await page.addInitScript(() => localStorage.setItem("probook_theme", "dark"));

    const failures: Record<string, LowContrast[]> = {};
    let seen = 0;

    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await expect(page.locator("html")).toHaveClass(/dark/);

      const found = await page.evaluate((minRatio) => {
        const parse = (c: string): [number, number, number, number] => {
          const m = c.match(/[\d.]+/g);
          if (!m) return [0, 0, 0, 0];
          return [Number(m[0]), Number(m[1]), Number(m[2]), m[3] === undefined ? 1 : Number(m[3])];
        };

        const luminance = ([r, g, b]: number[]) => {
          const f = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };

        /** The first ancestor that actually paints something behind this text. */
        const backgroundOf = (el: Element): [number, number, number, number] => {
          let node: Element | null = el;
          while (node) {
            const [r, g, b, a] = parse(getComputedStyle(node).backgroundColor);
            if (a > 0.5) return [r, g, b, a];
            node = node.parentElement;
          }
          return [0, 0, 0, 1];
        };

        let examined = 0;
        const out: unknown[] = [];
        for (const el of Array.from(document.body.querySelectorAll("*"))) {
          // Leaf text only: a container reports its children's words too, which
          // would blame the wrong element.
          const own = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent ?? "")
            .join("")
            .trim();
          if (!own) continue;

          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none") continue;
          if (Number(style.opacity) < 0.5) continue;
          const box = el.getBoundingClientRect();
          if (box.width < 4 || box.height < 4) continue;

          const [tr, tg, tb, ta] = parse(style.color);
          if (ta < 0.5) continue;
          examined++;
          const bg = backgroundOf(el);

          const l1 = luminance([tr, tg, tb]);
          const l2 = luminance(bg);
          const ratio =
            (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          if (ratio >= minRatio) continue;

          out.push({
            text: own.slice(0, 40),
            color: style.color,
            background: `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`,
            ratio: Math.round(ratio * 100) / 100,
            tag: el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(/\s+/)[0]}` : ""),
          });
        }
        return { examined, low: out as LowContrast[] };
      }, MIN_RATIO);

      // A sweep that sweeps nothing passes too. Per route the floor is only
      // "it rendered at all" — the till opens on a heading and a button — and
      // the real proof is the total, checked once at the end.
      expect(found.examined, `nothing rendered on ${route}`).toBeGreaterThan(0);
      seen += found.examined;
      if (found.low.length) failures[route] = found.low;
    }

    const report = Object.entries(failures)
      .map(([route, items]) =>
        `${route}\n` +
        items.map((i) => `    ${i.ratio}:1  "${i.text}"  ${i.color} on ${i.background}  <${i.tag}>`).join("\n")
      )
      .join("\n");

    expect(seen, "the sweep read almost nothing — it is broken, not the pages")
      .toBeGreaterThan(300);
    expect(failures, `Text below ${MIN_RATIO}:1 in the dark theme:\n${report}`).toEqual({});
  });
});
