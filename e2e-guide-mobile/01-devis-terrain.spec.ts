import { test, expect } from "../e2e-guide/lib/test";
import { Tour } from "../e2e-guide/lib/tour";
import { resume } from "../e2e-guide/lib/session";
import { t } from "../e2e-guide/lib/i18n";
import { CLIENT, PRODUCTS } from "../e2e-guide/lib/data";

/** The folded row for a line — also the way into its editing sheet. */
const foldedLine = (page: import("@playwright/test").Page, index: number) =>
  page.locator("li > button").nth(index);

test("Mobile 1 — Chiffrer chez le client", async ({ page }) => {
  const tour = await Tour.open(page, "1 · Devis sur le terrain");
  await resume(page, "dashboard");
  await tour.titleCard("Un devis sur place", "Depuis le téléphone, chez le client");

  await tour.say(
    "Le client vous montre ce qu'il veut. Plutôt que de noter sur un carnet, on chiffre tout de suite."
  );
  await tour.nav("/quotes");
  await tour.click(tour.button(t("quotes:newQuote")));

  await tour.say("On choisit le client.");
  await tour.pick(tour.fieldByLabel(`${t("quotes:fields.client")} *`), CLIENT.name, {
    search: "Atlas",
  });

  // ─── une ligne à la fois ───
  await tour.say(
    "Sur téléphone, le devis se lit comme une liste. On touche une ligne pour l'ouvrir."
  );
  await tour.click(foldedLine(page, 0));

  const sheet = tour.dialog();
  await tour.say("Le produit vient du catalogue : désignation, prix et TVA se remplissent seuls.");
  await tour.pick(sheet.locator("label").filter({ hasText: t("quotes:lines.product") }).locator(".."), PRODUCTS.tv.designation, {
    search: PRODUCTS.tv.search,
  });

  await tour.say("La quantité et le prix ont chacun leur champ, taille d'un pouce.");
  await tour.set(sheet.locator('input[name="lines.0.quantity"]'), "2");

  await tour.say("Le total de la ligne se calcule pendant la saisie.");
  await tour.click(tour.button(t("quotes:lines.doneLine")));

  // ─── la ligne repliée ───
  await tour.say(
    "La ligne se replie : quantité, désignation, montant. Tout tient sur une ligne d'écran."
  );
  await expect(foldedLine(page, 0)).toContainText("2 ×");

  // ─── deuxième ligne, hors catalogue ───
  await tour.say("On ajoute la pose, qui n'est pas au catalogue. La ligne s'ouvre directement.");
  await tour.click(tour.button(t("quotes:lines.addLine")));

  const second = tour.dialog();
  await tour.type(second.locator('input[name="lines.1.description"]'), PRODUCTS.install.designation);
  await tour.set(second.locator('input[name="lines.1.quantity"]'), "2");
  await tour.set(second.locator('input[name="lines.1.unit_price"]'), PRODUCTS.install.salePrice);
  await tour.set(second.locator('input[name="lines.1.tax_rate"]'), "19");
  await tour.click(tour.button(t("quotes:lines.doneLine")));

  await tour.say(
    "Deux lignes, le total du devis juste au-dessus : on relit tout devant le client sans faire défiler."
  );

  // ─── marge et remise, debout devant le client ───
  await tour.say(
    "Plus bas, la marge s'affiche pendant qu'on saisit : on sait ce qu'on peut lâcher avant de le dire."
  );
  await expect(page.getByText(t("quotes:margin.label")).first()).toBeVisible();

  await tour.say("Le client négocie : 5 % de remise, la marge se recalcule aussitôt.");
  await tour.set(page.locator('input[name="discount_percent"]'), "5");

  await tour.click(tour.button(t("quotes:createQuote")));
  await expect(page).toHaveURL(/\/quotes/);

  await tour.say(
    "Le devis est numéroté et enregistré. Le client repart avec un chiffrage, vous avec une affaire en cours."
  );
  await expect(page.getByText(CLIENT.name).first()).toBeVisible();
});
