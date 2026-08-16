import { test, expect } from "./lib/test";
import { Tour, LOCALE } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";
import { LABELS, LOCATIONS, PRODUCTS } from "./lib/data";

test("Chapitre 6 — Vendre au comptoir avec la caisse", async ({ page }) => {
  const tour = await Tour.open(page, "6 · Caisse");
  await resume(page, "dashboard");
  await tour.titleCard("La caisse", "Chapitre 6 — session, encaissement, rapport Z");

  // The POS fills the viewport top to bottom; the caption sits at the top so it
  // never covers the payment bar at the bottom of the cart.
  await tour.captionPosition("top");

  await tour.say("Pour la vente au comptoir, Probook bascule en mode caisse.");
  // Resolved through the bundle, not spelled out: /caisse/i matched nothing
  // once the same chapter was run against the English interface, where the
  // button reads "POS Mode".
  await tour.click(
    page.locator("aside button").filter({ hasText: t("navigation:posMode") }).first(),
    { settleMs: 2000 }
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
    await tour.click(createRegister, { settleMs: 800 });
    // Placeholders, not positions: the product search box is also a text input.
    await tour.type(page.getByPlaceholder(t("pos:registerNamePlaceholder")), LABELS.register);
    await tour.type(
      page.getByPlaceholder(t("pos:registerLocationPlaceholder")),
      LOCATIONS.shop
    );
    await tour.click(tour.button(t("pos:createRegister")), { settleMs: 1800 });
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
    await tour.click(openSession, { settleMs: 2200 });
  }

  await expect(searchBox).toBeVisible({ timeout: 30_000 });
  await tour.say("La caisse est ouverte. À droite, le catalogue ; à gauche, le panier.");
  await tour.pause(1600);

  // ─── vente ───
  await tour.say("On peut scanner un code-barres, ou simplement toucher l'article.");
  await tour.click(page.getByRole("button").filter({ hasText: PRODUCTS.tv.designation }).first(), {
    settleMs: 1200,
  });

  await tour.say("Recherchons le second article.");
  await tour.type(page.getByPlaceholder(t("pos:searchProducts")), "HDMI");
  await tour.pause(900);
  await tour.click(
    page.getByRole("button").filter({ hasText: PRODUCTS.cable.designation }).first(),
    { settleMs: 1000 }
  );

  await tour.say("Cet article a plusieurs tarifs : détail ou gros. On prend le prix de détail.");
  await tour.click(tour.dialog().getByRole("button", { name: t("pos:defaultPrice") }), {
    settleMs: 1400,
  });

  await tour.say("Le panier totalise les articles, la TVA et le montant à encaisser.");
  await tour.pause(1800);

  // ─── encaissement ───
  await tour.say("On passe au paiement.");
  await tour.click(page.getByRole("button").filter({ hasText: new RegExp(t("pos:pay")) }).first(), {
    settleMs: 1200,
  });

  // Scope to the payment panel: the till behind it is full of buttons too.
  const payModal = tour.posOverlay();
  await tour.say(
    "Cinq façons de régler : espèces, carte, chèque, virement, ou sur le compte du client."
  );
  await expect(
    payModal.getByRole("button").filter({ hasText: t("pos:cheque") }).first()
  ).toBeVisible();
  await tour.pause(1600);
  await tour.say(
    "Un chèque ou un virement se note avec sa référence ; seules les espèces bougent le tiroir-caisse, et le rapport de fin de journée le sait."
  );
  await tour.pause(1600);

  await tour.say("Ici, le client paie en espèces.");
  await tour.click(payModal.getByRole("button").filter({ hasText: t("pos:cash") }).first());

  await tour.say("On saisit le montant remis par le client.");
  await tour.set(payModal.locator('input[type="number"]').first(), "60000");

  await tour.say("Probook calcule le rendu de monnaie automatiquement.");
  await tour.pause(1800);

  const confirmPayment = payModal.getByRole("button", { name: t("pos:confirm") });
  await expect(confirmPayment).toBeEnabled({ timeout: 15_000 });
  await tour.click(confirmPayment, { settleMs: 2500 });
  await tour.say("Vente enregistrée, ticket imprimé, stock décrémenté. Panier vidé pour le client suivant.");
  await tour.pause(1500);

  // ─── mouvement de caisse ───
  await tour.say("En cours de journée, on trace les entrées et sorties d'espèces.");
  await tour.click(tour.button(t("pos:menu")), { settleMs: 700 });
  await tour.click(page.getByRole("button", { name: t("pos:cashMovement") }), { settleMs: 1200 });

  const movement = tour.posOverlay();
  await tour.click(movement.getByRole("button", { name: t("pos:cashOut") }));
  await tour.set(movement.locator('input[type="number"]').first(), "2000");
  await tour.type(movement.locator('input[type="text"]').first(), LABELS.supplies);
  await tour.click(movement.getByRole("button", { name: t("pos:addCashOut") }), { settleMs: 1800 });

  await tour.say("Le mouvement s'ajoute à la liste ; la caisse reste ouverte pour en saisir d'autres.");
  await tour.pause(1500);
  // The panel intentionally stays open to record several movements in a row.
  await tour.click(movement.locator("button").first(), { settleMs: 800 });

  // ─── historique ───
  await tour.say("L'historique liste les tickets de la session, et permet d'en annuler un.");
  await tour.click(tour.button(t("pos:menu")), { settleMs: 700 });
  await tour.click(page.getByRole("button", { name: t("pos:transactionHistory") }), {
    settleMs: 2000,
  });
  await tour.pause(1800);
  // The drawer closes on its header X (no Escape handler) or on the backdrop.
  await tour.click(page.locator("div.fixed.inset-0.z-50.flex").locator("button").first(), {
    settleMs: 900,
  });

  // ─── clôture ───
  await tour.say("En fin de journée, on ferme la caisse : c'est le rapport Z.");
  await tour.click(tour.button(t("pos:menu")), { settleMs: 700 });
  await tour.click(page.getByRole("button", { name: t("pos:closeSession") }), { settleMs: 2000 });

  await tour.say(
    "Probook affiche le nombre de tickets, les ventes en espèces et par carte, et le montant attendu en caisse."
  );
  await tour.pause(2600);

  await tour.say("On saisit les espèces réellement comptées.");
  const closeDialog = tour.posOverlay();
  await tour.set(closeDialog.locator('input[type="number"]').first(), "48000");
  await tour.say("L'écart éventuel est signalé immédiatement.");
  await tour.pause(2000);

  const confirmClose = closeDialog.getByRole("button", { name: t("pos:closeSession") }).last();
  // The button stays disabled until the session summary has loaded.
  await expect(confirmClose).toBeEnabled({ timeout: 20_000 });
  await tour.click(confirmClose, { settleMs: 2500 });

  await tour.say("Session clôturée. Le rapport reste consultable dans les rapports.");
  await tour.captionPosition("bottom");
});
