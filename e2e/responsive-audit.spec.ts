import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./helpers";
import { apiPost, setupClient, setupProduct, setupIssuedInvoice } from "./api-helpers";

/**
 * Two sweeps over every application page, in the two languages that share the
 * same layout rules.
 *
 * ─── Horizontal overflow ───
 * A page you have to scroll sideways is not usable on a phone, and the failure
 * is invisible on a desktop screen — a table one column too wide, a button row
 * that will not wrap. 390 px is the iPhone-class width the guide will be filmed
 * at.
 *
 * ─── Raw translation keys ───
 * A missing key does not crash: react-i18next prints the key path itself.
 *
 * Two unit tests in src/i18n cover most of this ground already — parity between
 * the locale files, and every literal key in the source resolving to a string.
 * What is left is the part no static pass can reach: `t(`status:${row.state}`)`
 * is wrong only for the values that actually occur. So the page is asked
 * directly, via the list i18next itself fills in (see missingKeyHandler in
 * src/i18n/index.ts), and the DOM is read as a backstop for the strings that
 * never go through i18next at all.
 */
const ROUTES = [
  "dashboard",
  "clients",
  "products",
  "quotes",
  "invoices",
  "delivery-notes",
  "suppliers",
  "purchases",
  "locations",
  "expenses",
  "reports",
  "phonebook",
  "settings",
  "pos",
  // The form pages are where a layout most often breaks: they carry the
  // widest rows and the most controls.
  "quotes/new",
  "invoices/new",
  "delivery-notes/new",
  "invoices/credit-notes",
];

const PHONE = { width: 390, height: 844 };

/**
 * Namespaces the app declares; a raw key always starts with one of them.
 *
 * Read from disk rather than written out here. The hand-kept list had drifted
 * to sixteen entries against the app's twenty — `admin`, the second most used
 * namespace in the codebase, was among the four it no longer looked for.
 */
const NAMESPACES = fs
  .readdirSync(path.join(process.cwd(), "src/i18n/locales/fr"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

/**
 * Give the account enough content that lists render rows rather than empty
 * states — an empty table never overflows.
 */
async function seed(page: Page) {
  const client = await setupClient(page, "Société Générale de Câblage et Sécurité Numérique");
  await setupProduct(page, "Caméra IP extérieure varifocale 5MP infrarouge 60 m", 24500, {
    quantity: 12,
  });
  await setupIssuedInvoice(page, {
    client_id: client.id,
    issue_date: "2026-06-01",
    lines: [
      {
        description: "Installation complète du système de vidéosurveillance sur trois bâtiments",
        quantity: 4,
        unit_price: 24500,
        tax_rate: 19,
      },
    ],
  });
  await apiPost(page, "/api/expenses", {
    name: "Carburant — tournée d'installations du mois",
    amount: 6800,
    date: "2026-06-05",
    category_name: "Carburant",
  });
}

async function overflowOf(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}

async function rawKeysOn(page: Page, namespaces: string[]): Promise<string[]> {
  return page.evaluate((ns) => {
    const found = new Set<string>();

    // Visible text: "reports:pipeline.title" printed in the middle of a page.
    const prefixed = new RegExp(`\\b(${ns.join("|")}):[A-Za-z][\\w.]*`, "g");
    for (const hit of (document.body.innerText ?? "").match(prefixed) ?? []) found.add(hit);

    // Accessible names hide the same failure where innerText cannot see it: a
    // menu button whose aria-label was "nav.openMenu" read that way to every
    // screen reader for months. Attributes carry no namespace prefix, so match
    // the dotted shape instead — and only where a sentence never would.
    const dotted = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/;
    for (const attribute of ["aria-label", "title", "placeholder", "alt"]) {
      for (const el of document.querySelectorAll(`[${attribute}]`)) {
        const value = el.getAttribute(attribute)?.trim() ?? "";
        if (value && dotted.test(value)) found.add(`[${attribute}] ${value}`);
      }
    }

    return [...found];
  }, namespaces);
}

/**
 * What i18next itself could not resolve on this page.
 *
 * Exact where the DOM sweep is a guess: it names the namespace, the key and
 * the language, it sees keys that never reach the screen as text — an
 * aria-label, a document title, a toast that has already faded — and it cannot
 * mistake a filename for a key path.
 */
async function missingKeysOn(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found = window.__I18N_MISSING__ ?? [];
    window.__I18N_MISSING__ = [];
    return found;
  });
}

test.describe("Responsive and translation audit", () => {
  test("no page scrolls sideways at 390 px", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(PHONE);
    await signUp(page);
    await seed(page);

    const offenders: string[] = [];
    for (const route of ROUTES) {
      await page.goto(`/fr/${route}`);
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(250);
      // One pixel of slack: sub-pixel rounding on borders is not a layout bug.
      const overflow = await overflowOf(page);
      if (overflow > 1) offenders.push(`${route}: ${overflow}px`);
    }

    expect(offenders, `Pages overflowing at ${PHONE.width}px:\n${offenders.join("\n")}`).toEqual([]);
  });

  test("no figure is clipped inside its own box at 390 px", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(PHONE);
    await signUp(page);
    await seed(page);

    /**
     * The test above only catches text that pushes the *page* sideways. A total
     * set too large for its card does not do that: the card hides the overflow
     * and the number is simply cut. "198 968,00 DZD" became "198,968.0", which
     * is not obviously wrong at a glance — and that is exactly what makes it
     * worth failing a build over.
     *
     * Deliberate truncation is exempt: an element ending in an ellipsis has
     * told the reader something is missing. Silent clipping has not.
     */
    const offenders: string[] = [];
    for (const locale of ["fr", "ar"]) {
      for (const route of ROUTES) {
        await page.goto(`/${locale}/${route}`);
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(250);

        const clipped = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of Array.from(document.querySelectorAll("*"))) {
            const node = el as HTMLElement;
            if (node.children.length) continue; // leaf nodes carry the text
            const text = node.textContent?.trim();
            if (!text) continue;
            const style = getComputedStyle(node);
            if (style.textOverflow === "ellipsis") continue;
            if (style.overflowX === "auto" || style.overflowX === "scroll") continue;
            if (node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 2) {
              out.push(
                `${node.tagName.toLowerCase()} "${text.slice(0, 40)}" ` +
                  `(${node.scrollWidth}px in ${node.clientWidth}px)`
              );
            }
          }
          return out;
        });

        for (const c of clipped) offenders.push(`${locale}/${route} - ${c}`);
      }
    }

    expect(
      offenders,
      `Text silently cut off inside its container at ${PHONE.width}px:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  test("no page prints a raw translation key", async ({ page }) => {
    test.setTimeout(300_000);
    await signUp(page);
    await seed(page);

    const offenders: string[] = [];
    // All three languages: a key can be defined in one locale and missing in
    // another, and only the reader of that language would ever see it.
    for (const locale of ["fr", "en", "ar"]) {
      for (const route of ROUTES) {
        await page.goto(`/${locale}/${route}`);
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(250);
        for (const key of await missingKeysOn(page)) {
          offenders.push(`${locale}/${route}: unresolved ${key}`);
        }
        for (const key of await rawKeysOn(page, NAMESPACES)) {
          offenders.push(`${locale}/${route}: on screen ${key}`);
        }
      }
    }

    expect(offenders, `Raw keys:\n${offenders.join("\n")}`).toEqual([]);
  });
});
