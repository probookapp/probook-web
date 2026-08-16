import { test, expect } from "./lib/test";
import { Tour } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";
import { CLIENT_2, EXPENSE, LABELS, PRODUCTS } from "./lib/data";

test("Chapitre 9 — Bons de livraison et dépenses", async ({ page }) => {
  const tour = await Tour.open(page, "9 · Livraisons & dépenses");
  await resume(page, "delivery-notes");
  await tour.titleCard("Livraisons & dépenses", "Chapitre 9 — bons de livraison, charges");

  // ─── bon de livraison ───
  await tour.say(
    "Quand la marchandise part avant la facture, on édite un bon de livraison à joindre au colis."
  );
  await tour.click(tour.button(t("delivery:newDeliveryNote")), { settleMs: 1400 });

  await tour.pick(tour.fieldByLabel(`${t("delivery:fields.client")} *`), CLIENT_2.name, {
    search: "Numidia",
  });

  await tour.say("On indique l'adresse de livraison si elle diffère de l'adresse de facturation.");
  await tour.type(
    page.locator('textarea[name="delivery_address"]'),
    "Zone d'activité Es Sénia, Oran"
  );

  await tour.say("Puis les articles livrés.");
  await tour.pick(tour.fieldByLabel(t("delivery:lines.product")), PRODUCTS.cable.designation, {
    search: "HDMI",
  });
  await tour.set(page.locator('input[name="lines.0.quantity"]'), "5");

  await tour.click(tour.button(t("delivery:createDeliveryNote")), { settleMs: 2000 });

  // Saving lands straight on the note, not back on the list.
  await expect(page).toHaveURL(/delivery-notes\/[0-9a-f-]{36}/);
  await expect(page.getByText(CLIENT_2.name).first()).toBeVisible();
  await tour.say("Le bon est prêt à imprimer. Il pourra être transformé en facture plus tard.");
  await tour.pause(1800);

  await tour.say("Une fois la marchandise remise, on marque le bon comme livré.");
  await tour.click(tour.button(t("delivery:actions.markAsDelivered")), { settleMs: 1200 });
  const confirm = tour.dialog();
  if (await confirm.isVisible().catch(() => false)) {
    await tour.click(confirm.getByRole("button", { name: t("common:buttons.confirm") }), {
      settleMs: 1800,
    });
  }
  await tour.pause(1200);

  // ─── dépenses ───
  await tour.nav("/expenses");
  await tour.say(
    "Dernier volet du quotidien : les charges. Loyer, électricité, carburant — tout ce qui sort de la caisse."
  );
  await tour.click(tour.button(t("expenses:newExpense")), { settleMs: 1000 });

  const expense = tour.dialog();
  await tour.type(expense.locator('input[name="name"]'), EXPENSE.name);
  await tour.set(expense.locator('input[name="amount"]'), EXPENSE.amount);
  await tour.say(
    "Chaque dépense se range sous un poste. On en choisit un dans la liste ou on en saisit un nouveau : il est créé à l'enregistrement."
  );
  await tour.type(expense.locator('input[name="category_name"]'), t("expenses:suggestions.rent"));
  await tour.type(expense.locator('textarea[name="notes"]'), LABELS.rentMonthly);
  await tour.click(expense.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 1600,
  });

  await expect(tour.row(EXPENSE.name)).toBeVisible();
  // Scoped to the row: the page also renders a hidden mobile card carrying the
  // same words, and a bare getByText would resolve to that.
  await expect(tour.row(EXPENSE.name)).toContainText(t("expenses:suggestions.rent"));

  // A second expense under the same heading, so the report has something to group.
  await tour.click(tour.button(t("expenses:newExpense")), { settleMs: 900 });
  const fuel = tour.dialog();
  await tour.type(fuel.locator('input[name="name"]'), LABELS.fuelInstall);
  await tour.set(fuel.locator('input[name="amount"]'), "6800");
  await tour.type(fuel.locator('input[name="category_name"]'), t("expenses:suggestions.fuel"));
  await tour.click(fuel.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 1600,
  });

  await tour.say("Les postes se gèrent à part : on peut en renommer un, ou en supprimer un devenu inutile.");
  await tour.click(tour.button(t("expenses:categories.manage")), { settleMs: 1200 });
  await expect(page.getByText(t("expenses:categories.title")).first()).toBeVisible();
  await tour.pause(1600);
  await tour.click(tour.dialog().getByRole("button", { name: t("common:aria.close") }), {
    settleMs: 1000,
  });

  await tour.say(
    "Ces dépenses viennent en déduction dans le rapport de résultat et l'export comptable, et le rapport « dépenses par poste » montre où part l'argent."
  );
  await tour.pause(1800);
});
