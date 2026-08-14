import { test, expect } from "@playwright/test";
import { Tour } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";
import { CLIENT, PRODUCTS } from "./lib/data";

test("Chapitre 4 — Du devis à la facture", async ({ page }) => {
  const tour = await Tour.open(page, "4 · Devis");
  await resume(page, "quotes");
  await tour.titleCard("Les devis", "Chapitre 4 — chiffrer, envoyer, convertir");

  await tour.say(
    "Un client demande un chiffrage : on lui prépare un devis, qui deviendra une facture d'un seul clic une fois accepté."
  );

  await tour.click(tour.button(t("quotes:newQuote")), { settleMs: 1200 });

  await tour.say("On choisit le client. La liste se filtre à la frappe.");
  await tour.pick(tour.fieldByLabel(`${t("quotes:fields.client")} *`), CLIENT.name, {
    search: "Atlas",
  });

  await tour.say(
    "Les dates d'émission et de validité sont pré-remplies : le devis est valable 30 jours par défaut."
  );
  await tour.pause(900);

  // ─── lignes ───
  await tour.say("Première ligne : on sélectionne un produit du catalogue.");
  await tour.pick(tour.fieldByLabel(t("quotes:lines.product")), PRODUCTS.tv.designation, {
    search: PRODUCTS.tv.search,
  });
  await tour.say("Désignation, prix et TVA se remplissent tout seuls. On ajuste la quantité.");
  await tour.set(page.locator('input[name="lines.0.quantity"]'), "3");

  await tour.say("On ajoute une deuxième ligne.");
  await tour.click(tour.button(t("quotes:lines.addLine")));
  await tour.pick(
    tour.fieldByLabel(t("quotes:lines.product"), undefined, 1),
    PRODUCTS.install.designation,
    { search: PRODUCTS.install.search }
  );
  await tour.set(page.locator('input[name="lines.1.quantity"]'), "3");

  await tour.say("Le total hors taxe, la TVA et le total TTC se recalculent en direct.");
  await tour.pause(1400);

  // ─── marge ───
  await tour.say(
    "Sous les totaux, la marge s'affiche en direct : ce que le chantier rapporte réellement, calculé sur le prix d'achat des produits."
  );
  await expect(page.getByText(t("quotes:margin.label")).first()).toBeVisible();
  await tour.pause(1800);

  // ─── remise ───
  await tour.say(
    "Le client négocie : on accorde une remise commerciale de 5 %. La marge se met à jour, on voit tout de suite ce qu'on peut lâcher."
  );
  await tour.set(page.locator('input[name="discount_percent"]'), "5");
  await tour.pause(1800);
  await tour.say(
    "La remise reste une ligne à part : total des lignes, remise, base HT, TVA. Le devis se recalcule toujours depuis lui-même."
  );
  await tour.pause(1600);

  await tour.say("On peut aussi demander un acompte, ici 30 % à la commande.");
  await tour.set(page.locator('input[name="down_payment_percent"]'), "30");
  await tour.pause(1200);

  await tour.click(tour.button(t("quotes:createQuote")), { settleMs: 1800 });
  await expect(page).toHaveURL(/\/quotes/);

  // ─── consultation + PDF ───
  await tour.say("Le devis est enregistré avec un numéro généré automatiquement.");
  const quoteRow = tour.row(CLIENT.name);
  await expect(quoteRow).toBeVisible();
  await tour.click(tour.rowAction(CLIENT.name, t("common:buttons.view")), { settleMs: 2000 });

  await tour.say("Voici le document tel que le client le recevra, en PDF.");
  await tour.pause(2500);

  // ─── acceptation ───
  await tour.say("Le client accepte : on passe le devis au statut « Accepté ».");
  await tour.click(tour.button(t("common:buttons.edit")), { settleMs: 1500 });
  await tour.choose(page.locator('select[name="status"]'), "ACCEPTED");
  await tour.click(tour.button(t("common:buttons.save")), { settleMs: 1800 });

  // ─── conversion ───
  await tour.say("Le bouton de conversion apparaît alors sur le devis accepté.");
  await tour.click(tour.rowAction(CLIENT.name, t("common:buttons.view")), { settleMs: 1500 });
  await tour.click(tour.button(t("quotes:actions.convertToInvoice")), { settleMs: 900 });

  await tour.say("Une confirmation, et le devis devient une facture — sans ressaisie.");
  await tour.click(tour.dialog().getByRole("button", { name: t("common:buttons.confirm") }), {
    settleMs: 2000,
  });

  await expect(page).toHaveURL(/\/invoices/);
  await expect(tour.row(CLIENT.name)).toBeVisible();
  await tour.say("La facture est créée, reprenant lignes, quantités et montants du devis.");
});
