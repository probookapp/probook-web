import { test, expect } from "@playwright/test";
import { Tour } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";
import { BIZ, LOCATIONS, PRODUCTS } from "./lib/data";

test("Chapitre 8 — Plusieurs points de vente et transferts de stock", async ({ page }) => {
  const tour = await Tour.open(page, "8 · Stock");
  await resume(page, "locations");
  await tour.titleCard("Le stock multi-sites", "Chapitre 8 — emplacements et transferts");

  await tour.say(
    "Quand l'activité grandit, le stock se répartit entre le magasin et le dépôt. Probook suit les quantités emplacement par emplacement."
  );

  // ─── emplacements ───
  await tour.say(
    "Probook a déjà créé un emplacement par défaut au nom de votre entreprise : c'est là que se trouve tout le stock saisi jusqu'ici. Renommons-le."
  );
  await tour.click(tour.rowAction(BIZ.company, t("common:buttons.edit")), { settleMs: 1000 });

  const shopForm = tour.dialog();
  await tour.type(shopForm.locator("input").first(), LOCATIONS.shop);
  await tour.click(shopForm.getByRole("button", { name: t("common:buttons.save"), exact: true }), {
    settleMs: 1400,
  });
  await expect(tour.row(LOCATIONS.shop)).toBeVisible();

  await tour.say("Ajoutons maintenant le dépôt.");
  await tour.click(tour.button(t("locations:newLocation")));
  const depotForm = tour.dialog();
  await tour.type(depotForm.locator("input").first(), LOCATIONS.warehouse);
  await tour.choose(depotForm.locator('select[name="location-type"]'), "warehouse");
  await tour.click(depotForm.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 1400,
  });

  await expect(page.getByText(LOCATIONS.warehouse).first()).toBeAttached();

  // ─── transfert ───
  await tour.say("On transfère maintenant des articles du magasin vers le dépôt.");
  await tour.click(tour.button(t("locations:tabs.transfers")), { settleMs: 900 });
  await tour.click(tour.button(t("locations:transfers.newTransfer")), { settleMs: 1200 });

  const transfer = tour.dialog();
  await tour.say("Origine et destination.");
  await tour.choose(transfer.locator('select[name="from-location"]'), { label: LOCATIONS.shop });
  await tour.choose(transfer.locator('select[name="to-location"]'), { label: LOCATIONS.warehouse });

  await tour.say("Puis les articles et les quantités à déplacer.");
  await tour.pick(
    tour.fieldByLabel(t("locations:transfers.fields.product"), transfer),
    PRODUCTS.cable.designation,
    { search: "HDMI" }
  );
  await tour.set(transfer.locator('input[type="number"]').first(), "20");

  await tour.click(transfer.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 2000,
  });
  await tour.say("Le transfert est tracé : rien ne se perd entre deux sites.");
  await tour.pause(1800);

  // ─── stock par emplacement ───
  await tour.nav("/products");
  await tour.say("Sur la fiche produit, le stock se lit désormais emplacement par emplacement.");
  await tour.click(tour.rowAction(PRODUCTS.cable.designation, t("products:stockLocations.title")), {
    settleMs: 2000,
  });
  await tour.pause(2400);
  await tour.click(tour.dialog().locator("button[aria-label]").first(), { settleMs: 800 });

  // ─── alerte stock faible ───
  await tour.say(
    "Enfin, Probook signale les articles en stock faible pour éviter la rupture."
  );
  await tour.goto("reports");
  await tour.click(tour.button(t("reports:lowStock.title")), { settleMs: 2000 });
  await tour.pause(2400);
});
