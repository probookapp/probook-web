import { test, expect } from "@playwright/test";
import { Tour } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";
import { PRODUCTS, SUPPLIER } from "./lib/data";

test("Chapitre 7 — Fournisseurs et réapprovisionnement", async ({ page }) => {
  const tour = await Tour.open(page, "7 · Achats");
  await resume(page, "suppliers");
  await tour.titleCard("Les achats", "Chapitre 7 — fournisseurs, commandes, réception");

  // ─── fournisseur ───
  await tour.say("Le stock baisse : il faut réapprovisionner. Commençons par créer le fournisseur.");
  await tour.click(tour.button(t("suppliers:newSupplier")));

  const form = tour.dialog();
  await tour.type(form.locator('input[name="name"]'), SUPPLIER.name);
  await tour.type(form.locator('input[name="email"]'), SUPPLIER.email);
  await tour.type(form.locator('input[name="phone"]'), SUPPLIER.phone);
  await tour.type(form.locator('textarea[name="address"]'), SUPPLIER.address);
  await tour.click(form.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 1400,
  });
  await expect(tour.row(SUPPLIER.name)).toBeVisible();

  // ─── bon de commande ───
  await tour.say("On lui passe maintenant un bon de commande.");
  await tour.nav("/purchases");
  await tour.click(tour.button(t("purchases:newPurchase")), { settleMs: 1200 });

  const order = tour.dialog();
  await tour.pick(tour.fieldByLabel(`${t("purchases:fields.supplier")} *`, order), SUPPLIER.name);

  await tour.say("On commande des téléviseurs. Le prix d'achat connu est repris automatiquement.");
  await tour.pick(
    tour.fieldByLabel(`${t("purchases:fields.product")} *`, order),
    PRODUCTS.tv.designation,
    { search: PRODUCTS.tv.search }
  );
  await tour.set(order.locator('input[name="lines.0.quantity"]'), "10");

  await tour.say("Le fournisseur a augmenté ses tarifs : on saisit le nouveau prix.");
  await tour.set(order.locator('input[name="lines.0.unit_price"]'), "34500");

  await tour.say("Probook rappelle l'ancien prix et propose de recalculer le prix moyen pondéré.");
  await tour.pause(1800);

  await tour.say("Ajoutons une deuxième référence à la même commande.");
  await tour.click(order.getByRole("button", { name: t("purchases:fields.addLine") }));
  await tour.pick(
    tour.fieldByLabel(`${t("purchases:fields.product")} *`, order, 1),
    PRODUCTS.cable.designation,
    { search: "HDMI" }
  );
  await tour.set(order.locator('input[name="lines.1.quantity"]'), "50");

  await tour.click(order.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 1800,
  });
  await tour.say("Le bon de commande est enregistré, en attente de réception.");
  await expect(tour.row(SUPPLIER.name)).toBeVisible();

  // ─── réception ───
  await tour.say(
    "La marchandise arrive. La réception est l'étape qui fait entrer les quantités en stock."
  );
  await tour.click(tour.rowAction(SUPPLIER.name, t("purchases:actions.confirm")), {
    settleMs: 1400,
  });

  const receive = tour.dialog();
  await tour.say(
    "On peut réceptionner partiellement : ici le fournisseur n'a livré que 8 téléviseurs sur 10."
  );
  await tour.set(receive.locator('input[type="number"]').first(), "8");
  await tour.pause(1200);

  await tour.click(receive.getByRole("button", { name: t("purchases:confirmModal.confirm") }), {
    settleMs: 2200,
  });

  await tour.say("La commande passe en « partiellement reçu » et le stock a été crédité.");
  await tour.pause(1600);

  // ─── contrôle du stock ───
  await tour.nav("/products");
  await tour.say("Vérifions : le stock du téléviseur a bien augmenté de 8 unités.");
  await tour.point(tour.row(PRODUCTS.tv.designation));
  await tour.pause(2000);

  // ─── crédit fournisseur ───
  await tour.say("Reste à suivre ce que l'on doit au fournisseur.");
  await tour.nav("/suppliers");
  await tour.click(tour.rowAction(SUPPLIER.name, t("suppliers:credits.title")), {
    settleMs: 1800,
  });

  await tour.say("Total dû, total payé et solde, avec le détail des commandes impayées.");
  await tour.pause(2400);
});
