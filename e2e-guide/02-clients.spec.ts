import { test, expect } from "@playwright/test";
import { Tour } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";
import { CLIENT, CLIENT_2, CONTACT } from "./lib/data";

test("Chapitre 2 — Gérer son fichier clients", async ({ page }) => {
  const tour = await Tour.open(page, "2 · Clients");
  await resume(page, "clients");
  await tour.titleCard("Les clients", "Chapitre 2 — fiche client, contacts, recherche");

  await tour.say(
    "Tout part du fichier clients : c'est lui qui alimente les devis, les factures et les relevés de compte."
  );

  // ─── création d'un client ───
  await tour.say("Créons une première fiche.");
  await tour.click(tour.button(t("clients:newClient")));

  const form = tour.dialog();
  await tour.say("Seule la raison sociale est obligatoire, le reste peut être complété plus tard.");
  await tour.type(form.locator('input[name="name"]'), CLIENT.name);
  await tour.type(form.locator('input[name="email"]'), CLIENT.email);
  await tour.type(form.locator('input[name="phone"]'), CLIENT.phone);

  await tour.say(
    "Les identifiants fiscaux algériens — NIF, registre de commerce, NIS — remonteront automatiquement sur les factures PDF."
  );
  await tour.type(form.locator('input[name="vat_number"]'), CLIENT.nif);
  await tour.type(form.locator('input[name="siret"]'), CLIENT.rc);
  await tour.type(form.locator('input[name="nis"]'), CLIENT.nis);

  await tour.say("On complète l'adresse de facturation.");
  await tour.type(form.locator('input[name="address"]'), CLIENT.address);
  await tour.type(form.locator('input[name="postal_code"]'), CLIENT.postalCode);
  await tour.type(form.locator('input[name="city"]'), CLIENT.city);

  await tour.click(form.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 1200,
  });
  await expect(tour.row(CLIENT.name)).toBeVisible();
  await tour.say("La fiche est enregistrée et apparaît immédiatement dans la liste.");

  // ─── deuxième client, pour la recherche ───
  await tour.click(tour.button(t("clients:newClient")));
  const form2 = tour.dialog();
  await tour.type(form2.locator('input[name="name"]'), CLIENT_2.name);
  await tour.type(form2.locator('input[name="email"]'), CLIENT_2.email);
  await tour.type(form2.locator('input[name="phone"]'), CLIENT_2.phone);
  await tour.type(form2.locator('input[name="city"]'), CLIENT_2.city);
  await tour.click(form2.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 1200,
  });
  await expect(tour.row(CLIENT_2.name)).toBeVisible();

  // ─── contacts rattachés ───
  await tour.say(
    "Chaque client peut avoir plusieurs interlocuteurs : acheteur, comptable, responsable technique…"
  );
  await tour.click(tour.rowAction(CLIENT.name, t("clients:viewContacts")), { settleMs: 900 });

  const details = tour.dialog();
  await tour.click(details.getByRole("button", { name: t("common:buttons.add"), exact: true }));

  const contactForm = tour.dialog();
  const contactInputs = contactForm.locator("input:not([type='checkbox'])");
  await tour.type(contactInputs.nth(0), "Yacine Hamdi");
  await tour.type(contactInputs.nth(1), CONTACT.role);
  await tour.type(contactInputs.nth(2), "y.hamdi@atlas-distribution.dz");
  await tour.type(contactInputs.nth(3), "0770 45 12 89");

  await tour.say("On peut désigner un contact principal, celui utilisé par défaut dans les emails.");
  await tour.click(contactForm.locator("#is_primary"));
  await tour.click(contactForm.getByRole("button", { name: t("common:buttons.add"), exact: true }), {
    settleMs: 1000,
  });

  await expect(details.getByText("Yacine Hamdi")).toBeVisible();
  await tour.say("Le contact est rattaché à la fiche.");
  await tour.click(details.getByRole("button", { name: t("common:buttons.close"), exact: true }), {
    settleMs: 800,
  });

  // ─── recherche ───
  await tour.say("Quand le fichier grandit, la recherche filtre instantanément.");
  await tour.type(page.locator('input[name="client-search"]'), "Numidia");
  await tour.pause(1000);
  await expect(tour.row(CLIENT_2.name)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: CLIENT.name })).toHaveCount(0);

  await tour.set(page.locator('input[name="client-search"]'), "");
  await tour.pause(800);

  // ─── annuaire ───
  await tour.say(
    "Tous les contacts de tous vos clients se retrouvent au même endroit, dans l'annuaire."
  );
  await tour.nav("/phonebook");
  await expect(page.getByText(t("common:phonebook.subtitle")).first()).toBeVisible();
  await tour.say("Un nom, un email, un numéro : on cherche sans savoir chez quel client il travaille.");
  await tour.type(page.getByPlaceholder(t("common:phonebook.searchPlaceholder")), "Yacine");
  await tour.pause(1400);

  await tour.goto("clients");

  // ─── export ───
  await tour.say("Et toute la liste s'exporte en CSV, par exemple pour votre comptable.");
  const download = page.waitForEvent("download", { timeout: 15_000 });
  await tour.click(tour.button(t("common:buttons.exportCsv")));
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^clients_.*\.csv$/);
  await tour.say("Le fichier est téléchargé, prêt à être ouvert dans Excel.");
});
