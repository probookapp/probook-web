import { test, expect } from "@playwright/test";
import { Tour } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";
import { BIZ, CLIENT } from "./lib/data";

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
  await tour.click(page.locator('input[name="stamp_duty_enabled"]'));
  await tour.set(page.locator('input[name="stamp_duty_threshold"]'), "0");
  await tour.pause(1800);

  await tour.say("On enregistre.");
  await tour.click(page.getByRole("button", { name: t("common:buttons.save"), exact: true }).last(), {
    settleMs: 2200,
  });

  // ─── vérification sur une facture ───
  await tour.say("Le droit de timbre apparaît désormais sur les factures réglées en espèces.");
  await tour.nav("/invoices");
  await tour.click(tour.rowAction(CLIENT.name, t("common:buttons.view")), { settleMs: 2200 });
  await tour.pause(2000);

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
  await tour.titleCard("Merci", "probook.dz — votre gestion commerciale, simplement");
});
