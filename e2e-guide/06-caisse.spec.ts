import { test, expect } from "./lib/test";
import { Tour, LOCALE } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";
import { LABELS, LOCATIONS, PRODUCTS } from "./lib/data";

test("Chapitre 6 — Vendre au comptoir avec la caisse", async ({ page }) => {
  const tour = await Tour.open(page, "6 · Caisse");
  await resume(page, "dashboard");
  await tour.titleCard("La caisse", "Chapitre 6 — session, encaissement, rapport Z");

  await tour.say("Pour la vente au comptoir, Probook bascule en mode caisse.");
  // Resolved through the bundle, not spelled out: /caisse/i matched nothing
  // once the same chapter was run against the English interface, where the
  // button reads "POS Mode".
  await tour.click(
    page.locator("aside button").filter({ hasText: t("navigation:posMode") }).first()
  );
  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/pos`));

  // ─── création de la caisse ───
  // The till has three possible entry screens (no register / register but no
  // open session / active session) and it auto-selects an existing register a
  // beat after mounting. Reading the screen too early catches that transient,
  // so wait until the same screen is observed twice before branching.
  const screen = async () => {
    if (await page.getByPlaceholder(t("pos:searchProducts")).isVisible().catch(() => false))
      return "active";
    if (await tour.button(t("pos:openSession")).isVisible().catch(() => false)) return "session";
    if (await tour.button(t("pos:createRegister")).isVisible().catch(() => false))
      return "register";
    return "unknown";
  };
  let seen = await screen();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(400);
    const again = await screen();
    if (again === seen && again !== "unknown") break;
    seen = again;
  }

  const createRegister = tour.button(t("pos:createRegister"));
  if (seen === "register") {
    await tour.say("Première utilisation : on déclare le poste de caisse.");
    await tour.click(createRegister);
    // Placeholders, not positions: the product search box is also a text input.
    await tour.type(page.getByPlaceholder(t("pos:registerNamePlaceholder")), LABELS.register);
    await tour.type(
      page.getByPlaceholder(t("pos:registerLocationPlaceholder")),
      LOCATIONS.shop
    );
    await tour.click(tour.button(t("pos:createRegister")));
  }

  // ─── ouverture de session ───
  const openSession = tour.button(t("pos:openSession"));
  const searchBox = page.getByPlaceholder(t("pos:searchProducts"));

  // Wait for whichever screen the register lands on rather than for a delay:
  // the narration pauses are stripped in verification mode, so anything that
  // relied on them would be a race there.
  await expect(openSession.or(searchBox).first()).toBeVisible({ timeout: 30_000 });

  if (await openSession.isVisible().catch(() => false)) {
    await tour.say(
      "Chaque journée commence par l'ouverture de la session : on saisit le fond de caisse."
    );
    await tour.set(page.locator('input[type="number"]').first(), "5000");
    await tour.click(openSession);
  }

  await expect(searchBox).toBeVisible({ timeout: 30_000 });
  await tour.say("La caisse est ouverte. À droite, le catalogue ; à gauche, le panier.");

  // ─── vente ───
  await tour.say("On peut scanner un code-barres, ou simplement toucher l'article.");
  await tour.click(page.getByRole("button").filter({ hasText: PRODUCTS.tv.designation }).first());

  await tour.say("Recherchons le second article.");
  await tour.type(page.getByPlaceholder(t("pos:searchProducts")), "HDMI");
  await tour.click(
    page.getByRole("button").filter({ hasText: PRODUCTS.cable.designation }).first()
  );

  await tour.say("Cet article a plusieurs tarifs : détail ou gros. On prend le prix de détail.");
  await tour.click(tour.dialog().getByRole("button", { name: t("pos:defaultPrice") }));

  await tour.say("Le panier totalise les articles, la TVA et le montant à encaisser.");

  // ─── encaissement ───
  await tour.say("On passe au paiement.");
  await tour.click(page.getByRole("button").filter({ hasText: new RegExp(t("pos:pay")) }).first());

  // Scope to the payment panel: the till behind it is full of buttons too.
  const payModal = tour.dialog();
  await tour.say(
    "Cinq façons de régler : espèces, carte, chèque, virement, ou sur le compte du client."
  );
  await expect(
    payModal.getByRole("button").filter({ hasText: t("pos:cheque") }).first()
  ).toBeVisible();
  await tour.say(
    "Un chèque ou un virement se note avec sa référence ; seules les espèces bougent le tiroir-caisse, et le rapport de fin de journée le sait."
  );

  await tour.say("Ici, le client paie en espèces.");
  await tour.click(payModal.getByRole("button").filter({ hasText: t("pos:cash") }).first());

  await tour.say("On saisit le montant remis par le client.");
  await tour.set(payModal.locator('input[type="number"]').first(), "60000");

  await tour.say("Probook calcule le rendu de monnaie automatiquement.");

  const confirmPayment = payModal.getByRole("button", { name: t("pos:confirm") });
  await expect(confirmPayment).toBeEnabled({ timeout: 15_000 });
  await tour.click(confirmPayment);
  await tour.say("Vente enregistrée, ticket imprimé, stock décrémenté. Panier vidé pour le client suivant.");

  // ─── mouvement de caisse ───
  await tour.say("En cours de journée, on trace les entrées et sorties d'espèces.");
  await tour.click(tour.button(t("pos:menu")));
  await tour.click(page.getByRole("button", { name: t("pos:cashMovement") }));

  const movement = tour.dialog();
  await tour.click(movement.getByRole("button", { name: t("pos:cashOut") }));
  await tour.set(movement.locator('input[type="number"]').first(), "2000");
  await tour.type(movement.locator('input[type="text"]').first(), LABELS.supplies);
  await tour.click(movement.getByRole("button", { name: t("pos:addCashOut") }));

  await tour.say("Le mouvement s'ajoute à la liste ; la caisse reste ouverte pour en saisir d'autres.");
  // The panel intentionally stays open to record several movements in a row.
  await tour.click(movement.getByRole("button", { name: t("pos:close"), exact: true }).last());

  // ─── historique ───
  await tour.say("L'historique liste les tickets de la session, et permet d'en annuler un.");
  await tour.click(tour.button(t("pos:menu")));
  await tour.click(page.getByRole("button", { name: t("pos:transactionHistory") }));
  // The drawer closes on its header X (no Escape handler) or on the backdrop.
  await tour.click(page.locator("div.fixed.inset-0.z-50.flex").locator("button").first());

  // ─── clôture ───
  await tour.say("En fin de journée, on ferme la caisse : c'est le rapport Z.");
  await tour.click(tour.button(t("pos:menu")));
  await tour.click(page.getByRole("button", { name: t("pos:closeSession") }));

  await tour.say(
    "Probook affiche le nombre de tickets, les ventes en espèces et par carte, et le montant attendu en caisse."
  );

  await tour.say("On saisit les espèces réellement comptées.");
  const closeDialog = tour.dialog();
  await tour.set(closeDialog.locator('input[type="number"]').first(), "48000");
  await tour.say("L'écart éventuel est signalé immédiatement.");

  const confirmClose = closeDialog.getByRole("button", { name: t("pos:closeSession") }).last();
  // The button stays disabled until the session summary has loaded.
  await expect(confirmClose).toBeEnabled({ timeout: 20_000 });
  await tour.click(confirmClose);

  await tour.say("Session clôturée. Le rapport reste consultable dans les rapports.");
});
