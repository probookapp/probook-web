import { test, expect } from "@playwright/test";
import { Tour } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";
import { CLIENT, LABELS } from "./lib/data";

test("Chapitre 5 — Facturer, encaisser, corriger", async ({ page }) => {
  const tour = await Tour.open(page, "5 · Factures");
  await resume(page, "invoices");
  await tour.titleCard("Les factures", "Chapitre 5 — émission, paiements, avoir");

  await tour.say(
    "La facture issue du devis est encore en brouillon : elle est modifiable et ne touche ni le stock ni la comptabilité."
  );
  await tour.click(tour.rowAction(CLIENT.name, t("common:buttons.view")), { settleMs: 1500 });

  // ─── émission ───
  await tour.say(
    "L'émission est l'étape qui compte : elle fige la facture, la numérote définitivement et décrémente le stock."
  );
  await tour.click(tour.button(t("invoices:actions.markAsIssued")), { settleMs: 2500 });

  await expect(page.getByText(t("invoices:status.ISSUED"), { exact: true }).first()).toBeVisible();
  await tour.say("Le statut passe à « Émise ».");

  await tour.say(
    "Probook signe alors le document. Ce contrôle d'intégrité prouve que la facture n'a pas été modifiée après émission."
  );
  const integrity = page.getByText(t("invoices:integrityValid"), { exact: true });
  await expect(integrity).toBeVisible();
  await tour.point(integrity);
  await tour.pause(1800);

  // ─── paiement partiel ───
  await tour.say("Le client verse un acompte. On enregistre un premier règlement.");
  await tour.click(page.getByRole("button", { name: t("common:buttons.add"), exact: true }), {
    settleMs: 900,
  });

  const payment = tour.dialog();
  await tour.say("Le montant proposé est le solde restant : on le remplace par l'acompte reçu.");
  await tour.set(payment.locator('input[name="amount"]'), "50000");
  await tour.choose(payment.locator('select[name="payment_method"]'), "virement");
  await tour.type(payment.locator('input[name="reference"]'), "VIR-2026-0412");
  await tour.click(payment.getByRole("button", { name: t("common:payments.savePayment") }), {
    settleMs: 2000,
  });

  await tour.say("Le suivi affiche le total facturé, le total payé et le reste à payer.");
  await tour.pause(2000);

  // ─── solde ───
  await tour.say("Quelques jours plus tard, le client règle le solde.");
  await tour.click(page.getByRole("button", { name: t("common:buttons.add"), exact: true }), {
    settleMs: 900,
  });
  const payment2 = tour.dialog();
  await tour.choose(payment2.locator('select[name="payment_method"]'), "especes");
  await tour.click(payment2.getByRole("button", { name: t("common:payments.savePayment") }), {
    settleMs: 2200,
  });

  await expect(page.getByText(t("invoices:status.PAID"), { exact: true }).first()).toBeVisible();
  await tour.say("La facture bascule automatiquement en « Payée » : plus rien à faire.");

  // ─── avoir ───
  await tour.say(
    "Un article revient ? On n'efface jamais une facture émise : on émet un avoir, comme l'exige la réglementation."
  );
  await tour.click(tour.button(t("invoices:creditNotes.create")), { settleMs: 1200 });

  const creditNote = tour.dialog();
  // The modal's inputs are [date, reason] — neither carries a name attribute.
  await tour.type(creditNote.locator("input").nth(1), LABELS.returned);
  await tour.say("On indique la quantité à rembourser, ligne par ligne.");
  await tour.set(creditNote.locator('input[type="number"]').first(), "1");
  await tour.say("Et on choisit de réintégrer l'article en stock.");
  await tour.click(creditNote.locator('input[type="checkbox"]').first());
  await tour.click(creditNote.getByRole("button", { name: t("invoices:creditNotes.create") }), {
    settleMs: 2500,
  });

  await expect(page).toHaveURL(/credit-notes/);
  await tour.say("L'avoir est créé, numéroté et rattaché à la facture d'origine.");
  await tour.pause(2000);

  // ─── filtrer et ranger ───
  await tour.say(
    "Quand les factures s'accumulent, on trie par état : les brouillons, les émises non réglées, les payées."
  );
  await tour.goto("invoices");
  await tour.click(tour.button(t("common:status.paid")), { settleMs: 1400 });
  await tour.say(
    "Le tri se fait côté serveur : la réponse porte sur toutes les factures, pas seulement celles déjà chargées à l'écran."
  );
  await tour.pause(1400);

  await tour.say("Et une facture soldée peut être rangée sans jamais être supprimée.");
  await tour.click(tour.action(t("common:buttons.archive")), { settleMs: 1600 });
  await tour.say(
    "Elle quitte la liste de travail mais garde son numéro, son montant, et continue de compter dans la TVA et l'export comptable."
  );
  await tour.click(tour.button(t("common:filters.archived")), { settleMs: 1400 });
  await tour.pause(1600);

  // Ranger n'est pas supprimer : on la ressort, et la suite du guide la
  // retrouve à sa place.
  await tour.say("Et on la ressort quand on veut : archiver, ce n'est pas supprimer.");
  await tour.click(tour.action(t("common:buttons.unarchive")), { settleMs: 1600 });
  await tour.click(tour.button(t("common:filters.all")), { settleMs: 1200 });
  await expect(tour.row(CLIENT.name)).toBeVisible();

  // ─── relevé client ───
  await tour.say("Côté client, tout cela se retrouve dans le relevé de compte.");
  await tour.goto("clients");
  await tour.click(tour.rowAction(CLIENT.name, t("clients:statement.title")), { settleMs: 2000 });

  await tour.say("Factures, règlements et avoirs, avec le solde dû en bas — prêt à être envoyé au client.");
  await tour.pause(2600);
});
