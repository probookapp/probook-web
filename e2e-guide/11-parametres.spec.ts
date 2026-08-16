import { test, expect } from "./lib/test";
import { Tour } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";
import { BIZ, CLIENT, PRODUCTS } from "./lib/data";

/** A tiny opaque PNG, used as the company logo in the branding demo. */
const LOGO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAT0lEQVR42u3PMQEAAAgDoC251a3g" +
    "LwSgOTcVAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIEHAt" +
    "H0kAAT8m3kUAAAAASUVORK5CYII=",
  "base64"
);

test("Chapitre 11 — Paramétrer son entreprise", async ({ page }) => {
  const tour = await Tour.open(page, "11 · Paramètres");
  await resume(page, "settings");
  await tour.titleCard("Les paramètres", "Chapitre 11 — entreprise, fiscalité, équipe");

  await tour.say(
    "Un dernier passage par les paramètres : c'est ici qu'on adapte Probook à son entreprise."
  );

  // ─── identité ───
  await tour.say("D'abord l'identité qui figurera sur tous les documents.");
  await tour.type(page.locator('input[name="company_name"]'), BIZ.company);
  await tour.type(page.locator('input[name="phone"]'), "021 45 67 89");
  await tour.type(page.locator('input[name="address"]'), "34 boulevard Krim Belkacem");
  await tour.type(page.locator('input[name="city"]'), "Alger");
  await tour.type(page.locator('input[name="postal_code"]'), "16000");

  // ─── logo ───
  await tour.say("On téléverse le logo : il apparaîtra en haut des factures et des devis.");
  // Two file inputs on this page: the logo, and the backup restore below.
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: LOGO_PNG,
  });
  await tour.pause(2000);

  // ─── régime fiscal ───
  await tour.say(
    "Le régime fiscal est le réglage clé : il détermine les taux de TVA proposés et les identifiants demandés."
  );
  await tour.point(page.locator('select[name="fiscal_profile"]'));
  await tour.pause(1800);

  await tour.say(
    "En Algérie, Probook demande le NIF, le registre de commerce, le NIS et l'article d'imposition."
  );
  await tour.type(page.locator('input[name="vat_number"]'), "000116009876543");
  await tour.type(page.locator('input[name="siret"]'), "16/00-9876543 B 04");
  await tour.type(page.locator('input[name="nis"]'), "0016987654321");
  await tour.type(page.locator('input[name="art"]'), "52101");

  await tour.say(
    "Une entreprise basée en France choisirait « France » : la TVA passe au barème français et les champs deviennent SIRET et numéro de TVA."
  );
  await tour.pause(2200);

  // ─── facturation ───
  await tour.say("La devise et la TVA par défaut sont déjà réglées pour l'Algérie : dinar et 19 %.");
  await tour.point(page.locator('select[name="currency"]'));
  await tour.pause(1600);

  await tour.say("Les préfixes et les compteurs pilotent la numérotation de vos documents.");
  await tour.set(page.locator('input[name="invoice_prefix"]'), "FA-2026-");
  await tour.set(page.locator('input[name="quote_prefix"]'), "DV-2026-");
  await tour.pause(1400);

  // ─── droit de timbre ───
  await tour.say(
    "Le droit de timbre s'active ici. Il s'applique aux règlements en espèces, selon le barème progressif officiel."
  );
  // Aim at a state, not at a click: replayed on a tenant that already has the
  // setting on, a blind click turned it back off and the rest of the chapter
  // then filmed an invoice with no timbre on it.
  const stampToggle = page.locator('input[name="stamp_duty_enabled"]');
  if (!(await stampToggle.isChecked())) await tour.click(stampToggle);
  await tour.set(page.locator('input[name="stamp_duty_threshold"]'), "0");
  await tour.pause(1800);

  await tour.say("On enregistre.");
  await tour.click(page.getByRole("button", { name: t("common:buttons.save"), exact: true }).last(), {
    settleMs: 2200,
  });

  // ─── vérification sur une facture ───
  // The timbre is snapshotted when an invoice is issued, so an invoice issued
  // earlier in the guide legitimately carries none — the narration used to open
  // one anyway and promise a line that was not there. A new cash invoice is
  // issued here instead, which is what actually demonstrates the setting.
  await tour.say("Le réglage vaut pour les factures émises à partir de maintenant. Émettons-en une.");
  await tour.nav("/invoices");
  await tour.click(tour.button(t("invoices:newInvoice")), { settleMs: 1400 });

  await tour.pick(tour.fieldByLabel(`${t("invoices:fields.client")} *`), CLIENT.name, {
    search: "Atlas",
  });
  await tour.pick(tour.fieldByLabel(t("invoices:lines.product")), PRODUCTS.cable.designation, {
    search: PRODUCTS.cable.search,
  });
  await tour.set(page.locator('input[name="lines.0.quantity"]'), "4");

  await tour.say("La case « vente au comptant » est cochée par défaut : c'est elle qui déclenche le timbre.");
  await tour.point(page.getByText(t("invoices:stampDuty.cashSale")));
  await tour.pause(1600);

  await tour.click(tour.button(t("invoices:createInvoice")), { settleMs: 2600 });
  // Saving returns to the list; the new invoice is the first row for the client.
  await tour.click(tour.rowAction(CLIENT.name, t("common:buttons.view")), { settleMs: 2000 });
  await tour.click(tour.button(t("invoices:actions.markAsIssued")), { settleMs: 2500 });

  await tour.say("Le droit de timbre s'ajoute au total à payer, sans entrer dans le chiffre d'affaires ni dans la TVA.");
  const stampLine = page.getByText(t("invoices:fields.stampDuty")).first();
  await expect(stampLine).toBeVisible();
  await tour.point(stampLine);
  await tour.pause(2200);

  // ─── équipe ───
  await tour.nav("/settings");
  await tour.say("Enfin, l'équipe : chaque employé a son compte et ses permissions.");
  await tour.click(tour.button(t("auth:userManagement.addUser")), { settleMs: 1200 });

  const userForm = tour.dialog();
  const inputs = userForm.locator("input:not([type='file'])");
  await tour.type(inputs.nth(0), "amina");
  await tour.type(inputs.nth(1), "Amina Cherif");
  await tour.type(inputs.nth(2), "Vendeuse2026!");

  await tour.say(
    "En choisissant le rôle « employé », on coche précisément les modules auxquels la personne accède."
  );
  await tour.choose(userForm.locator("select").first(), "employee");
  await tour.pause(2200);

  await tour.click(userForm.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 2000,
  });
  await expect(userForm).toBeHidden();

  await tour.say(
    "Voilà : de la création du compte à la clôture de caisse, vous avez fait le tour de Probook."
  );
  await tour.goto("dashboard");
  await tour.pause(1500);
  await tour.titleCard("Merci", "Probook — votre gestion commerciale, simplement");
});
