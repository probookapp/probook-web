import { test, expect } from "./lib/test";
import { Tour } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";
import { CLIENT, PRODUCTS } from "./lib/data";

/**
 * The label the chapter invents on camera.
 *
 * A place name rather than a word like "urgent": the whole point of the axis is
 * that it holds what the status cannot, and a site is the clearest example of
 * something true at the same time as "sent" or "accepted".
 */
const TAG_NAME = "Chantier Hydra";

/**
 * A product sold in two models, set up off camera.
 *
 * Chapter 03 films the catalogue without variants; what this chapter shows is
 * the quote choosing one, so the product is simply there when the viewer
 * arrives — the same way the mobile chapters arrange their starting position.
 */
async function aProductWithVariants(page: import("@playwright/test").Page) {
  await page.evaluate(async (mount) => {
    const post = (url: string, body: unknown) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }).then((r) => r.json());
    const product = await post("/api/products", {
      designation: mount.designation,
      reference: mount.reference,
      unit_price: mount.salePrice,
      purchase_price: mount.purchasePrice,
      tax_rate: 19,
      unit: "unit",
      is_service: false,
      has_variants: true,
    });
    for (const v of mount.variants) {
      await post(`/api/products/${product.id}/variants`, {
        name: v.name,
        quantity: v.quantity,
        price_override: v.priceOverride,
      });
    }
  }, PRODUCTS.mount);
}

test("Chapitre 4 — Du devis à la facture", async ({ page }) => {
  const tour = await Tour.open(page, "4 · Devis");
  await resume(page, "quotes");
  await aProductWithVariants(page);
  await page.reload();
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await tour.titleCard("Les devis", "Chapitre 4 — chiffrer, envoyer, convertir");

  await tour.say(
    "Un client demande un chiffrage : on lui prépare un devis, qui deviendra une facture d'un seul clic une fois accepté."
  );

  // ─── étiquettes ───
  await tour.say(
    "Avant de commencer : un devis a un statut, et il peut aussi porter vos propres étiquettes. Le statut dit où en est le document ; l'étiquette dit comment vous, vous le rangez."
  );
  await tour.click(tour.button(t("common:tags.manage")), { settleMs: 1000 });
  await tour.say(
    "On crée ici le vocabulaire de la maison : un chantier, une priorité, ce qu'on veut. Autant d'étiquettes qu'on veut, et une couleur pour les repérer."
  );
  await tour.type(tour.dialog().locator("#new-tag"), TAG_NAME);
  await tour.click(tour.dialog().getByRole("button", { name: t("common:buttons.add") }), {
    settleMs: 1200,
  });
  await expect(tour.dialog().getByText(TAG_NAME)).toBeVisible();
  await tour.say(
    "Une étiquette ne touche à rien : ni aux relances, ni à la conversion en facture, ni aux rapports. C'est un classement, pas un état."
  );
  await tour.click(tour.dialog().getByRole("button", { name: t("common:aria.close") }), {
    settleMs: 900,
  });

  await tour.click(tour.button(t("quotes:newQuote")), { settleMs: 1200 });

  await tour.say("On choisit le client. La liste se filtre à la frappe.");
  await tour.pick(tour.fieldByLabel(`${t("quotes:fields.client")} *`), CLIENT.name, {
    search: "Atlas",
  });

  await tour.say(
    "Les dates d'émission et de validité sont pré-remplies : le devis est valable 30 jours par défaut."
  );
  await tour.pause(900);

  await tour.say("Et on range tout de suite le devis sous son étiquette.");
  await tour.click(page.getByRole("button", { name: TAG_NAME, pressed: false }), {
    settleMs: 900,
  });
  await expect(page.getByRole("button", { name: TAG_NAME, pressed: true })).toBeVisible();

  // ─── lignes ───
  await tour.say("Première ligne : on sélectionne un produit du catalogue.");
  await tour.pick(tour.fieldByLabel(t("quotes:lines.product")), PRODUCTS.tv.designation, {
    search: PRODUCTS.tv.search,
  });
  await tour.say("Désignation, prix et TVA se remplissent tout seuls. On ajuste la quantité.");
  await tour.set(page.locator('input[name="lines.0.quantity"]'), "3");

  await tour.say("On ajoute une deuxième ligne.");
  await tour.click(tour.button(t("quotes:lines.addLine")));
  await tour.pick(
    tour.fieldByLabel(t("quotes:lines.product"), undefined, 1),
    PRODUCTS.install.designation,
    { search: PRODUCTS.install.search }
  );
  await tour.set(page.locator('input[name="lines.1.quantity"]'), "3");

  // ─── variante ───
  await tour.say("Troisième ligne : un support mural, vendu en deux modèles.");
  await tour.click(tour.button(t("quotes:lines.addLine")));
  await tour.pick(
    tour.fieldByLabel(t("quotes:lines.product"), undefined, 2),
    PRODUCTS.mount.designation,
    { search: PRODUCTS.mount.search }
  );
  await tour.say(
    "Probook demande alors quel modèle : chacun a son propre stock, et parfois son propre prix."
  );
  await tour.pick(
    tour.fieldByLabel(`${t("common:documentLines.variant")} *`),
    PRODUCTS.mount.variants[0].name
  );
  await expect(page.locator('input[name="lines.2.description"]')).toHaveValue(
    `${PRODUCTS.mount.designation} — ${PRODUCTS.mount.variants[0].name}`
  );
  await tour.set(page.locator('input[name="lines.2.quantity"]'), "3");
  await tour.say(
    "La désignation et le prix suivent le modèle choisi. À la facturation, c'est ce modèle précis qui sortira du stock."
  );
  await tour.pause(1400);

  await tour.say("Le total hors taxe, la TVA et le total TTC se recalculent en direct.");
  await tour.pause(1400);

  // ─── marge ───
  await tour.say(
    "Sous les totaux, la marge s'affiche en direct : ce que le chantier rapporte réellement, calculé sur le prix d'achat des produits."
  );
  await expect(page.getByText(t("quotes:margin.label")).first()).toBeVisible();
  await tour.pause(1800);

  // ─── remise ───
  await tour.say(
    "Le client négocie : on accorde une remise commerciale de 5 %. La marge se met à jour, on voit tout de suite ce qu'on peut lâcher."
  );
  await tour.set(page.locator('input[name="discount_percent"]'), "5");
  await tour.pause(1800);
  await tour.say(
    "La remise reste une ligne à part : total des lignes, remise, base HT, TVA. Le devis se recalcule toujours depuis lui-même."
  );
  await tour.pause(1600);

  await tour.say("On peut aussi demander un acompte, ici 30 % à la commande.");
  await tour.set(page.locator('input[name="down_payment_percent"]'), "30");
  await tour.pause(1200);

  await tour.click(tour.button(t("quotes:createQuote")), { settleMs: 1800 });
  await expect(page).toHaveURL(/\/quotes/);

  // ─── consultation + PDF ───
  await tour.say("Le devis est enregistré avec un numéro généré automatiquement.");
  const quoteRow = tour.row(CLIENT.name);
  await expect(quoteRow).toBeVisible();
  await tour.clickRowAction(CLIENT.name, t("common:buttons.view"), { settleMs: 2000 });

  await tour.say("Voici le document tel que le client le recevra, en PDF.");
  await tour.pause(2500);

  // ─── acceptation ───
  await tour.say("Le client accepte : on passe le devis au statut « Accepté ».");
  // Exact name: the labelled quote also shows "Modifier les étiquettes" first.
  const editQuote = page.getByRole("button", { name: t("common:buttons.edit"), exact: true });
  await tour.click(editQuote.filter({ visible: true }).first(), { settleMs: 1500 });
  await tour.say(
    "Les statuts sont une liste fixe, et « Refusé » en fait partie : un client qui dit non, c'est enregistré comme tel, Probook arrête de relancer, et le rapport de conversion le compte à part des devis restés sans réponse."
  );
  await expect(page.locator('select[name="status"]')).toContainText(t("quotes:status.REFUSED"));
  await tour.pause(1400);
  await tour.choose(page.locator('select[name="status"]'), "ACCEPTED");
  await tour.click(tour.button(t("common:buttons.save")), { settleMs: 1800 });

  // ─── conversion ───
  await tour.say("Le bouton de conversion apparaît alors sur le devis accepté.");
  await tour.clickRowAction(CLIENT.name, t("common:buttons.view"), { settleMs: 1500 });
  await tour.click(tour.button(t("quotes:actions.convertToInvoice")), { settleMs: 900 });

  await tour.say("Une confirmation, et le devis devient une facture — sans ressaisie.");
  await tour.click(tour.dialog().getByRole("button", { name: t("common:buttons.confirm") }), {
    settleMs: 2000,
  });

  await expect(page).toHaveURL(/\/invoices/);
  await expect(tour.row(CLIENT.name)).toBeVisible();
  await tour.say("La facture est créée, reprenant lignes, quantités et montants du devis.");

  // ─── l'étiquette a suivi ───
  await tour.say(
    "Et l'étiquette a suivi : le même mot sur le devis, sur la facture et sur le bon de livraison. Un chantier ne change pas de nom en changeant de document."
  );
  await expect(tour.row(CLIENT.name).getByText(TAG_NAME)).toBeVisible();
  await tour.pause(1600);
});
