import { test, expect } from "../e2e-guide/lib/test";
import { Tour } from "../e2e-guide/lib/tour";
import { resume } from "../e2e-guide/lib/session";
import { t } from "../e2e-guide/lib/i18n";
import { LABELS } from "../e2e-guide/lib/data";

test("Mobile 4 — Suivre l'activité", async ({ page }) => {
  const tour = await Tour.open(page, "4 · Pilotage");
  await resume(page, "expenses");
  await tour.titleCard("Suivre l'activité", "Une dépense, un coup d'œil, en deux minutes");

  // ─── une dépense saisie sur le pouce ───
  await tour.say(
    "Un plein de carburant, un péage : on saisit la dépense sur le moment, sinon elle est oubliée."
  );
  await tour.click(tour.button(t("expenses:newExpense")), { settleMs: 1400 });

  const expense = tour.dialog();
  await tour.type(expense.locator('input[name="name"]'), LABELS.fuelDay);
  await tour.set(expense.locator('input[name="amount"]'), "3200");
  await tour.say("On la range sous un poste : c'est ce qui rendra le rapport lisible plus tard.");
  await tour.type(expense.locator('input[name="category_name"]'), t("expenses:suggestions.fuel"));
  await tour.click(expense.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 2000,
  });
  await expect(page.getByText(LABELS.fuelDay).first()).toBeVisible();

  // ─── pilotage ───
  await tour.say("Et pour savoir où on en est, un seul rapport suffit.");
  await tour.nav("/reports");
  await tour.click(tour.button(t("reports:pipeline.title")), { settleMs: 2400 });

  await tour.say(
    "Combien de devis dehors, combien d'accepté pas encore facturé, combien de facturé pas encore encaissé."
  );
  await tour.pause(2600);

  await tour.say("Et où part l'argent, poste par poste.");
  await tour.click(tour.button(t("reports:expensesByCategory.title")), { settleMs: 2400 });
  await tour.pause(2400);

  await tour.say(
    "Tout ça depuis un téléphone, dans une camionnette. Probook fonctionne aussi hors connexion : les saisies partent dès que le réseau revient."
  );
  await tour.pause(2400);
});
