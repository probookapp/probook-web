import { test, expect } from "./lib/test";
import { Tour, LOCALE } from "./lib/tour";
import { t } from "./lib/i18n";

/**
 * The offers, and composing one.
 *
 * A chapter of its own, and the last one, for two reasons. Prices are data: a
 * grid moves and only this film has to be reshot, not the ten chapters about
 * using the product. And it is the one subject a viewer may want to send to
 * someone else — the person who signs, not the person who invoices.
 *
 * Not a single figure is spoken. The page shows the current grid; a number read
 * aloud would be wrong the day it changes, and wrong in a file nobody re-watches
 * to check.
 */
/**
 * Offer and module names live in the catalogue, not in a translation file, so
 * the recording script cannot hard-code them without becoming French-only. This
 * resolves them exactly as the page does — the translation for this locale, the
 * base name otherwise — which is also what keeps the script honest if someone
 * renames an offer in the admin panel.
 */
async function catalogueNames(page: import("@playwright/test").Page) {
  return page.evaluate(async (locale) => {
    const res = await fetch("/api/subscription/plans", { credentials: "include" });
    const data = await res.json();
    const pick = (name: string, tr: Record<string, string> | null) =>
      (tr && tr[locale]) || name;

    const plans = (data.plans || []) as {
      name: string;
      name_translations: Record<string, string> | null;
      monthly_price: number;
      features?: {
        feature?: { key: string; name: string; name_translations: Record<string, string> | null };
      }[];
    }[];

    const cheapest = plans.reduce((a, b) => (b.monthly_price < a.monthly_price ? b : a));
    let till = "";
    for (const plan of plans) {
      for (const link of plan.features || []) {
        if (link.feature?.key === "pos") {
          till = pick(link.feature.name, link.feature.name_translations);
        }
      }
    }
    return { base: pick(cheapest.name, cheapest.name_translations), till };
  }, LOCALE);
}

test("Chapitre 12 — Choisir ou composer son abonnement", async ({ page }) => {
  const tour = await Tour.open(page, "12 · Abonnement");

  await page.goto(`/${LOCALE}/pricing`);
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await tour.titleCard("L'abonnement", "Chapitre 12 — les offres et l'offre sur mesure");

  await tour.say(
    "L'essai gratuit donne accès à tout pendant dix jours. Ensuite, il faut choisir."
  );
  await tour.pause(1400);

  // ─── les trois offres ───
  await tour.say(
    "Trois offres. Chacune contient tout ce que contient la précédente : on ne perd jamais un module en montant."
  );
  const names = await catalogueNames(page);
  expect(names.base, "the catalogue must carry an entry offer").toBeTruthy();
  expect(names.till, "and a till module for the composer to sell").toBeTruthy();
  await page.getByText(names.base, { exact: false }).first().scrollIntoViewIfNeeded();
  await tour.pause(2000);

  await tour.say(
    "Essentiel, c'est le cœur du produit : les devis, les factures, les avoirs, le catalogue et les rapports de base. Ce socle n'est jamais vendu en morceaux."
  );
  await tour.pause(1600);
  await tour.say(
    "Commerce ajoute la caisse, les achats, les bons de livraison, les dépenses et l'import. C'est l'offre du commerce qui vend au comptoir."
  );
  await tour.pause(1600);
  await tour.say(
    "Entreprise ouvre le stock multi-sites, les rapports avancés, les relances et l'annuaire, sans limite d'utilisateurs."
  );
  await tour.pause(1600);

  await tour.say(
    "Le bouton bascule entre le paiement mensuel et le paiement annuel, qui revient moins cher."
  );
  const cycleToggle = page.getByRole("switch").first();
  await tour.point(cycleToggle);
  await tour.click(cycleToggle, { settleMs: 1200 });
  await tour.pause(1200);

  await tour.say("Chaque offre couvre aussi un nombre d'utilisateurs, affiché sur sa carte.");
  // The cards must actually be priced on screen: a pricing chapter filmed over
  // an empty catalogue would narrate offers nobody can see.
  await expect(
    page.getByText(t("common:landing.pricing.perMonth"), { exact: false }).first()
  ).toBeVisible();
  await tour.pause(1400);

  // ─── le composeur ───
  await tour.say(
    "Et si aucune des trois ne correspond exactement à votre activité, vous composez la vôtre."
  );
  const openComposer = page.getByRole("button", { name: t("common:composer.open") });
  await openComposer.scrollIntoViewIfNeeded();
  await tour.point(openComposer);
  await tour.click(openComposer, { settleMs: 1500 });

  await tour.say(
    "Le socle est toujours là — on ne peut pas s'en passer, c'est le produit. On ajoute ensuite les modules un par un."
  );
  await tour.pause(1600);

  // Ticking the till alone: one module is where composing is cheapest, and it
  // is the case a real shop actually asks about.
  const posModule = page.locator("label").filter({ hasText: names.till }).first();
  await tour.say("Un commerce qui veut la caisse, et rien d'autre, coche la caisse.");
  await tour.click(posModule, { settleMs: 1400 });
  await tour.say("Le total se met à jour immédiatement.");
  await tour.pause(1800);

  await tour.say("On choisit ensuite le nombre d'utilisateurs.");
  // The fieldset, not its wording: "Utilisateurs" also appears inside the note
  // about unlimited seats just below, and a substring match hits both.
  await expect(
    page.getByRole("group", { name: t("common:composer.seatsLegend") })
  ).toBeVisible();
  // The tier buttons carry the bare figure, so this line reads the same in the
  // French, English and Arabic runs.
  const seatsThree = page.getByRole("button", { name: "3", exact: true });
  await tour.point(seatsThree);
  await tour.click(seatsThree, { settleMs: 1500 });
  await tour.pause(1500);

  await tour.say(
    "Et quand une offre du catalogue contient exactement les mêmes modules pour moins cher, Probook le dit. Sans insister : c'est vous qui décidez."
  );
  await tour.pause(2000);

  // The composer is the point of the chapter; if it did not open, the film is
  // wrong and the run should say so rather than carry on narrating an empty page.
  await expect(page.getByText(t("common:composer.title"))).toBeVisible();

  await tour.say(
    "Une fois l'offre choisie ou composée, la demande part à notre équipe, qui l'active. Vos données, elles, ne bougent pas : elles étaient déjà là pendant l'essai."
  );
  await tour.pause(1800);

  await tour.say("Le guide s'arrête ici. Bonne gestion.");
  await tour.pause(1500);
});
