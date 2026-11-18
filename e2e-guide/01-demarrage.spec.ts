import { test, expect } from "./lib/test";
import { Tour, LOCALE } from "./lib/tour";
import { saveSession } from "./lib/session";
import { releaseDemoAccount } from "./lib/reset";
import { t } from "./lib/i18n";
import { BIZ } from "./lib/data";

test("Chapitre 1 — Créer son compte et découvrir Probook", async ({ page }) => {
  const tour = await Tour.open(page, "1 · Démarrage");

  // The address and the login are typed on camera, so they have to read like a
  // real shop's. The previous run's is removed rather than dodged with a stamp.
  const { username, email } = BIZ;
  await releaseDemoAccount({ email, username, staffUsernames: [BIZ.staffUsername] });

  await page.goto(`/${LOCALE}`);
  await page.waitForLoadState("domcontentloaded");
  await tour.titleCard("Probook", "Guide d'utilisation — Chapitre 1 : démarrage");

  await tour.say(
    "Probook est le logiciel de gestion commerciale pensé pour les commerces algériens : facturation, stock, caisse et comptabilité au même endroit."
  );
  // Scroll to the feature list and stop there. Blind pixel scrolls used to
  // carry on into the pricing section, which is data: the guide would have to
  // be reshot every time an offer changes, and it showed whatever plans the
  // database happened to hold.
  const features = page.getByText(t("common:landing.features.title")).first();
  await features.scrollIntoViewIfNeeded();

  // ─── inscription ───
  await tour.say("Commençons par créer un compte. L'inscription prend moins d'une minute.");
  await tour.goto("signup");

  await tour.say("On renseigne le nom de l'entreprise…");
  await tour.type(page.locator('input[autocomplete="organization"]'), BIZ.company);

  await tour.say("…le nom du responsable…");
  await tour.type(page.locator('input[autocomplete="name"]'), BIZ.owner);

  await tour.say("…une adresse email, qui servira à sécuriser le compte et à recevoir les documents.");
  await tour.type(page.locator('input[autocomplete="email"]'), email);

  // The username follows the email until it is edited; the guide still types
  // its own, since later chapters sign in with it.
  await tour.say("…l'identifiant de connexion se remplit tout seul depuis l'email, et reste modifiable…");
  await tour.type(page.locator('input[autocomplete="username"]'), username);

  await tour.say("…puis un mot de passe : la jauge en dessous indique sa solidité.");
  await tour.type(page.locator('input[autocomplete="new-password"]'), BIZ.password);

  await tour.say("Le pays de l'entreprise fixe la devise, les taux de TVA et les identifiants légaux.");
  await tour.choose(page.locator("form select"), "DZ");

  await tour.say("Il ne reste plus qu'à valider.");
  await tour.click(page.locator('button[type="submit"]'));

  await page.waitForURL(new RegExp(`/${LOCALE}/(dashboard|settings)`), { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

  // ─── premier contact avec l'application ───
  await tour.say(
    "Et voilà : le compte est créé et l'essai gratuit de 10 jours démarre automatiquement, sans carte bancaire."
  );

  // The banner text is interpolated ("{{days}} day(s) left"), so match its
  // fixed head rather than a French word that only exists in one locale.
  const trialLead = t("common:subscription.trialBanner").split("{{")[0].trim();
  const trialBanner = page.getByText(trialLead, { exact: false }).first();
  if (await trialBanner.isVisible().catch(() => false)) {
    await tour.point(trialBanner);
    await tour.say("Le bandeau en haut indique le nombre de jours restants.");
  }

  // ─── vérification de l'adresse email ───
  // The one step of the guide that needs a real inbox. We show it — the banner
  // and its "resend" button are part of the product — then clear the flag
  // through the test-only endpoint so the rest of the guide is not shown with
  // a permanent warning strip across every page.
  const verifyBanner = page.getByText(t("common:emailVerify.banner"));
  if (await verifyBanner.isVisible().catch(() => false)) {
    await tour.point(verifyBanner);
    await tour.say(
      "Un email de confirmation vient de partir à l'adresse saisie. Ce bandeau le rappelle, et permet de renvoyer le lien si besoin."
    );
    await tour.point(page.getByRole("button", { name: t("common:emailVerify.resend") }));
    await tour.say("Un clic sur le lien reçu, et l'adresse est validée.");

    const verified = await page.evaluate(async () => {
      const r = await fetch("/api/test/verify-email", {
        method: "POST",
        credentials: "include",
      });
      return r.status;
    });
    expect(verified).toBe(200);
    await page.reload();
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await expect(verifyBanner).toBeHidden();
    await tour.say("Le compte est confirmé.");
  }

  // Offers, named but never priced. Prices are data — a figure spoken on camera
  // would date the guide the first time the grid moves, and the pricing page
  // shows the current one anyway.
  await tour.say(
    "L'essai donne accès à tout. Ensuite, trois offres : Essentiel pour facturer, Commerce qui ajoute la caisse, les achats et les dépenses, Entreprise qui ouvre le multi-sites et les rapports avancés."
  );
  await tour.say(
    "Chaque offre couvre un nombre d'utilisateurs, et il est possible de composer son propre abonnement module par module. On y revient au dernier chapitre."
  );

  await tour.say(
    "Le tableau de bord affiche d'un coup d'œil le chiffre d'affaires, les factures en attente et les alertes."
  );

  await tour.say(
    "À gauche, le menu regroupe tous les modules : clients, produits, devis, factures, achats, stock et rapports."
  );
  for (const route of ["/clients", "/products", "/invoices", "/reports"]) {
    await tour.point(page.locator(`aside a[href="/${LOCALE}${route}"]`));
  }

  await tour.say("Et en bas, le bouton Mode caisse bascule l'application vers la vente au comptoir.");
  await tour.point(
    page.locator("aside button").filter({ hasText: t("navigation:posMode") }).first()
  );

  await tour.say("Dans les prochains chapitres, nous allons remplir ce compte pas à pas.");

  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/dashboard`));
  await saveSession(page, {
    company: BIZ.company,
    username,
    password: BIZ.password,
    email,
  });
});
