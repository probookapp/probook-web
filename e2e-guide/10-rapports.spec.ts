import { test, expect } from "./lib/test";
import { Tour } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";

test("Chapitre 10 — Piloter l'activité avec les rapports", async ({ page }) => {
  const tour = await Tour.open(page, "10 · Rapports");
  await resume(page, "dashboard");
  await tour.titleCard("Les rapports", "Chapitre 10 — chiffre d'affaires, marge, TVA, comptabilité");

  await tour.say(
    "Toutes les saisies des chapitres précédents alimentent le tableau de bord et les rapports."
  );
  await tour.pause(2000);

  await tour.say(
    "Chaque chiffre du tableau de bord est cliquable : « paiements en attente » ouvre directement la liste des factures émises non réglées."
  );
  await tour.pause(1800);

  await tour.nav("/reports");
  await tour.say("Seize rapports, chacun sur une période que vous choisissez.");
  await tour.pause(1600);

  // ─── pilotage ───
  await tour.say(
    "Le premier répond à la question de tous les jours : où en est-on ? Combien de devis dehors, combien d'accepté pas encore facturé, combien de facturé pas encore encaissé."
  );
  await tour.click(tour.button(t("reports:pipeline.title")), { settleMs: 2400 });
  await tour.pause(2400);
  await tour.say(
    "Chaque état est compté, y compris ceux à zéro — « aucun impayé » est une réponse, une ligne absente n'en est pas une."
  );
  await tour.pause(1800);

  // ─── chiffre d'affaires ───
  await tour.say("Le chiffre d'affaires par période, hors taxe et TTC, avec le nombre de factures.");
  await tour.click(tour.button(t("reports:revenueByPeriod.title")), { settleMs: 2200 });
  await tour.pause(2000);

  // ─── par client ───
  await tour.say("Qui sont vos meilleurs clients ?");
  await tour.click(tour.button(t("reports:revenueByClient.title")), { settleMs: 2200 });
  await tour.pause(1800);

  // ─── marge ───
  await tour.say(
    "Le rapport de marge compare prix de vente et prix d'achat, article par article : c'est là que se lit la rentabilité réelle."
  );
  await tour.click(tour.button(t("reports:profitMargin.title")), { settleMs: 2200 });
  await tour.pause(2200);

  // ─── impayés ───
  await tour.say("Les impayés, classés par ancienneté, pour savoir qui relancer.");
  await tour.click(tour.button(t("reports:outstanding.title")), { settleMs: 2200 });
  await tour.pause(1800);

  // ─── caisse ───
  await tour.say("Le rapport Z de la caisse, jour par jour.");
  await tour.click(tour.button(t("reports:posDaily.title")), { settleMs: 2200 });
  await tour.pause(1800);

  // ─── valorisation ───
  await tour.say("La valorisation du stock : combien vaut la marchandise en rayon.");
  await tour.click(tour.button(t("reports:inventoryValuation.title")), { settleMs: 2200 });
  await tour.pause(1800);

  // ─── dépenses par poste ───
  await tour.say(
    "Côté charges, les dépenses par poste montrent où part l'argent : loyer, carburant, fournitures, du plus lourd au plus léger."
  );
  await tour.click(tour.button(t("reports:expensesByCategory.title")), { settleMs: 2400 });
  await tour.pause(2200);

  // ─── TVA ───
  await tour.say(
    "Le récapitulatif de TVA : TVA collectée sur les ventes, TVA déductible sur les achats, et le net à payer."
  );
  await tour.click(tour.button(t("reports:taxSummary.title")), { settleMs: 2400 });
  await tour.pause(2400);

  // ─── export comptable ───
  await tour.say(
    "Et l'export comptable : le journal complet à remettre à votre comptable, en un fichier."
  );
  await tour.click(tour.button(t("reports:accountingExport.title")), { settleMs: 2400 });
  await tour.pause(1800);

  const download = page.waitForEvent("download", { timeout: 20_000 });
  await tour.click(tour.button(t("reports:accountingExport.downloadJournal")));
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.csv$/);
  await tour.say("Chaque rapport s'exporte en CSV, et la plupart en PDF.");
  await tour.pause(1600);
});
