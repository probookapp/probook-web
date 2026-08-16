import { test, expect } from "../e2e-guide/lib/test";
import { Tour, LOCALE } from "../e2e-guide/lib/tour";
import { resume } from "../e2e-guide/lib/session";
import { t } from "../e2e-guide/lib/i18n";
import { PRODUCTS } from "../e2e-guide/lib/data";

test("Mobile 3 — Vendre au comptoir", async ({ page }) => {
  const tour = await Tour.open(page, "3 · Comptoir");
  await resume(page, "pos");
  await tour.titleCard("Le comptoir", "La caisse tient dans une main");
  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/pos`));

  // The till has three possible entry screens and auto-selects a register a
  // beat after mounting; wait until the same screen is seen twice.
  const screen = async () => {
    if (await page.getByPlaceholder(t("pos:searchProducts")).isVisible().catch(() => false))
      return "active";
    if (await tour.button(t("pos:openSession")).isVisible().catch(() => false)) return "session";
    return "unknown";
  };
  let seen = await screen();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(400);
    const again = await screen();
    if (again === seen && again !== "unknown") break;
    seen = again;
  }

  const searchBox = page.getByPlaceholder(t("pos:searchProducts"));

  if (seen === "session") {
    await tour.say("On ouvre la caisse avec le fond de tiroir du matin.");
    await tour.click(tour.button(t("pos:openSession")), { settleMs: 1200 });

    // The till may already have been open when the chapter started — a previous
    // run leaves its session behind. Only fill the float if the dialog is really
    // there; otherwise the click landed on an already-open till and there is
    // nothing to do.
    const openDialog = tour.posOverlay();
    const float = openDialog.locator('input[type="number"]').first();
    if (await float.isVisible({ timeout: 4000 }).catch(() => false)) {
      await tour.set(float, "5000");
      await tour.click(openDialog.getByRole("button", { name: t("pos:openSession") }).last(), {
        settleMs: 2000,
      });
    }
  }

  // Whatever the entry screen was, the chapter films an open till.
  await expect(searchBox).toBeVisible({ timeout: 30_000 });

  // ─── liste compacte ───
  await tour.say(
    "Sur téléphone, la vue compacte remplace les vignettes : des lignes, sans photo, vingt articles à l'écran."
  );
  const compact = page.getByRole("button", { name: t("pos:compactView") });
  if ((await compact.getAttribute("aria-pressed")) !== "true") {
    await tour.click(compact, { settleMs: 1400 });
  }
  await expect(compact).toHaveAttribute("aria-pressed", "true");
  await tour.pause(1400);

  await tour.say("On cherche l'article, on l'ajoute au panier.");
  await tour.type(page.getByPlaceholder(t("pos:searchProducts")), "HDMI");
  await tour.pause(1200);
  // The compact row is itself a button; clicking the text inside it is not the
  // same thing, and left the basket empty.
  const row = page
    .getByRole("button")
    .filter({ hasText: PRODUCTS.cable.designation })
    .filter({ visible: true })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await tour.click(row, { settleMs: 1400 });

  // This article carries a wholesale tariff alongside the retail one, so the
  // till asks which applies before it joins the basket. Awaited rather than
  // probed: the dialog animates in, and an immediate isVisible() said no.
  await tour.say("Cet article a deux tarifs. Au comptoir, c'est le prix de détail.");
  // Scoped to the dialog: the same label exists elsewhere in the till, and a
  // page-wide match clicked something that did nothing.
  const tierPicker = tour.dialog().getByRole("button", { name: t("pos:defaultPrice") });
  await expect(tierPicker).toBeVisible({ timeout: 15_000 });
  await tour.click(tierPicker, { settleMs: 1400 });

  // Anchored on the start of the label: a loose "Panier" match also hits
  // "Vider le panier", and clicking that emptied the basket a step after
  // filling it.
  // Anchored at the start so it cannot match "Vider le panier" / "Clear cart",
  // which empties the very cart this line is checking.
  const cartTab = page
    .getByRole("button")
    .filter({ hasText: new RegExp("^" + t("pos:cart")) })
    .filter({ visible: true })
    .first();
  await expect(cartTab).toContainText("(1)", { timeout: 15_000 });

  // ─── le panier s'ouvre tout seul ───
  await tour.say(
    "L'écran est trop étroit pour tout montrer : articles et panier sont deux onglets, et le panier s'ouvre dès qu'on ajoute un article."
  );

  // .filter({ visible: true }) is not optional: the till renders a desktop
  // cart too, and its hidden pay button is always disabled.
  const payButton = page
    .getByRole("button")
    .filter({ hasText: new RegExp(t("pos:pay")) })
    .filter({ visible: true })
    .first();
  // Assert here rather than discovering an empty basket at the payment step.
  await expect(payButton).toBeEnabled({ timeout: 15_000 });
  await tour.say("Le panier totalise les articles, la TVA et le montant à encaisser.");
  await tour.pause(1600);

  // ─── règlement ───
  await tour.say("On passe au paiement.");
  await tour.click(payButton, { settleMs: 1400 });

  const payModal = tour.posOverlay();
  await tour.say(
    "Espèces, carte, chèque, virement, ou sur le compte du client. Seules les espèces bougent le tiroir."
  );
  await expect(
    payModal.getByRole("button").filter({ hasText: t("pos:cheque") }).first()
  ).toBeVisible();
  await tour.pause(1600);

  await tour.click(payModal.getByRole("button").filter({ hasText: t("pos:cash") }).first());
  // A note larger than the total: anything short would leave a balance, and the
  // till refuses to book that without a named client to chase.
  await tour.set(payModal.locator('input[type="number"]').first(), "5000");
  await tour.say("Le rendu de monnaie se calcule tout seul.");
  await tour.pause(1400);

  const confirmPayment = payModal.getByRole("button", { name: t("pos:confirm") });
  await expect(confirmPayment).toBeEnabled({ timeout: 15_000 });
  await tour.click(confirmPayment, { settleMs: 2500 });

  await tour.say("Vente enregistrée, stock décrémenté, panier vidé pour le client suivant.");
  await tour.pause(1800);
});
