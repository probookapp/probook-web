import { test, expect } from "./lib/test";
import { Tour } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";
import { CATEGORY, LABELS, PRODUCTS } from "./lib/data";

test("Chapitre 3 — Construire son catalogue produits", async ({ page }) => {
  const tour = await Tour.open(page, "3 · Produits");
  await resume(page, "products");
  await tour.titleCard("Le catalogue", "Chapitre 3 — catégories, produits, services, stock");

  // ─── catégories ───
  await tour.say("Avant les produits, créons une catégorie pour organiser le catalogue.");
  await tour.click(tour.button(new RegExp(t("products:tabs.categories"))));
  await tour.click(tour.button(t("products:categories.newCategory")));

  const catForm = tour.dialog();
  await tour.type(catForm.locator('input[name="name"]'), CATEGORY);
  await tour.click(catForm.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 1000,
  });
  await expect(page.getByText(CATEGORY, { exact: true }).first()).toBeVisible();
  await tour.say("Les catégories peuvent s'imbriquer, pour un rayon puis ses sous-rayons.");

  // ─── produit physique ───
  await tour.click(tour.button(new RegExp(t("products:tabs.products"))));
  await tour.say("Passons au premier article : un téléviseur.");
  await tour.click(tour.button(t("products:newProduct")));

  const form = tour.dialog();
  await tour.type(form.locator('input[name="designation"]'), PRODUCTS.tv.designation);
  await tour.type(form.locator('input[name="reference"]'), PRODUCTS.tv.reference);

  await tour.say("Le code-barres permettra de scanner l'article directement en caisse.");
  await tour.type(form.locator('input[name="barcode"]'), PRODUCTS.tv.barcode);

  await tour.say("On saisit le prix de vente hors taxe, le prix d'achat — qui servira à calculer la marge — et la TVA.");
  await tour.set(form.locator('input[name="unit_price"]'), PRODUCTS.tv.salePrice);
  await tour.set(form.locator('input[name="purchase_price"]'), PRODUCTS.tv.purchasePrice);
  // The field opens on the rate configured for the account — it used to open on
  // 0 %, and an invoice line takes its rate from the product, so anything sold
  // before someone noticed went out with no VAT on it.
  await expect(form.locator('select[name="tax_rate"]')).toHaveValue("19");
  await tour.choose(form.locator('select[name="tax_rate"]'), "19");

  await tour.say("On rattache l'article à sa catégorie et on saisit le stock de départ.");
  await tour.pick(tour.fieldByLabel(t("products:fields.category"), form), CATEGORY);
  await tour.set(form.locator('input[name="quantity"]'), PRODUCTS.tv.quantity);

  await tour.click(form.getByRole("button", { name: t("products:createProduct"), exact: true }), {
    settleMs: 1300,
  });
  await expect(tour.row(PRODUCTS.tv.designation)).toBeVisible();

  // ─── accessoire ───
  await tour.say("Ajoutons un accessoire, avec un tarif de gros en plus du prix de détail.");
  await tour.click(tour.button(t("products:newProduct")));
  const form2 = tour.dialog();
  await tour.type(form2.locator('input[name="designation"]'), PRODUCTS.cable.designation);
  await tour.type(form2.locator('input[name="reference"]'), PRODUCTS.cable.reference);
  await tour.type(form2.locator('input[name="barcode"]'), PRODUCTS.cable.barcode);
  await tour.set(form2.locator('input[name="unit_price"]'), PRODUCTS.cable.salePrice);
  await tour.set(form2.locator('input[name="purchase_price"]'), PRODUCTS.cable.purchasePrice);
  await tour.choose(form2.locator('select[name="tax_rate"]'), "19");
  await tour.set(form2.locator('input[name="quantity"]'), PRODUCTS.cable.quantity);

  await tour.say("La grille de prix permet plusieurs tarifs pour un même article : détail, demi-gros, gros.");
  await tour.click(form2.getByRole("button", { name: t("products:pricing.addTier") }));
  await tour.choose(form2.locator("select").last(), "wholesale");
  await tour.set(form2.locator('input[name="prices.0.price"]'), "1400");
  await tour.click(form2.getByRole("button", { name: t("products:createProduct"), exact: true }), {
    settleMs: 1300,
  });
  await expect(tour.row(PRODUCTS.cable.designation)).toBeVisible();

  // ─── prestation de service ───
  await tour.say("Probook gère aussi les prestations : un service n'a pas de stock à suivre.");
  await tour.click(tour.button(t("products:newProduct")));
  const form3 = tour.dialog();
  await tour.type(form3.locator('input[name="designation"]'), PRODUCTS.install.designation);
  await tour.type(form3.locator('input[name="reference"]'), PRODUCTS.install.reference);
  await tour.set(form3.locator('input[name="unit_price"]'), PRODUCTS.install.salePrice);
  await tour.choose(form3.locator('select[name="tax_rate"]'), "19");
  await tour.click(form3.locator("#is_service"));
  await tour.say("Le champ quantité disparaît : c'est bien une prestation.");
  await expect(form3.locator('input[name="quantity"]')).toHaveCount(0);
  await tour.click(form3.getByRole("button", { name: t("products:createProduct"), exact: true }), {
    settleMs: 1300,
  });
  await expect(tour.row(PRODUCTS.install.designation)).toBeVisible();

  // ─── ajustement de stock ───
  await tour.say(
    "Le stock se corrige à tout moment : inventaire, casse, retour. Ici on reçoit 3 téléviseurs supplémentaires."
  );
  await tour.clickRowAction(PRODUCTS.tv.designation, t("products:adjustStock.title"));

  const stock = tour.dialog();
  await tour.click(stock.getByRole("button", { name: t("products:adjustStock.deltaMode") }));
  await tour.set(stock.locator('input[type="number"]'), "3");
  await tour.type(stock.locator("textarea"), LABELS.restock);
  await tour.click(stock.getByRole("button", { name: t("products:adjustStock.apply") }), {
    settleMs: 1300,
  });

  await expect(tour.row(PRODUCTS.tv.designation)).toContainText("15");
  await tour.say("Le stock est passé de 12 à 15 unités.");

  // ─── historique des mouvements ───
  await tour.say("Chaque mouvement est tracé, avec son motif et son solde après opération.");
  await tour.clickRowAction(PRODUCTS.tv.designation, t("products:movements.title"), {
    settleMs: 1200,
  });
  const movements = tour.dialog();
  await expect(movements.getByText(t("products:movements.types.adjustment")).first()).toBeVisible();
  await tour.pause(1500);
  await tour.click(movements.locator('button[aria-label]').first(), { settleMs: 700 });

  // ─── pack ───
  // A client asked for it: an installer sells "the camera, its connectors and
  // the fitting" as one priced offer. Each component keeps its own VAT rate
  // and leaves the stock when the pack is sold (src/lib/bundles.ts).
  await tour.say(
    "On vend souvent un ensemble : le téléviseur, son câble et la pose. Un pack les réunit sous un seul prix."
  );
  await tour.click(tour.button(t("products:newProduct")));
  const packForm = tour.dialog();
  await tour.type(packForm.locator('input[name="designation"]'), PRODUCTS.pack.designation);
  await tour.type(packForm.locator('input[name="reference"]'), PRODUCTS.pack.reference);
  await tour.set(packForm.locator('input[name="unit_price"]'), PRODUCTS.pack.salePrice);
  await tour.click(packForm.locator("#is_bundle"));
  await tour.say("Un pack n'a ni stock ni taux de TVA à lui : ce sont ceux de ses composants.");
  await expect(packForm.locator('input[name="quantity"]')).toHaveCount(0);
  await tour.click(packForm.getByRole("button", { name: t("products:createProduct"), exact: true }), {
    settleMs: 1500,
  });

  await tour.say("Le pack est créé, et sa fiche s'ouvre pour choisir ce qu'il contient.");
  const composition = tour.dialog().getByTestId("bundle-manager");
  await expect(composition).toBeVisible();
  const components = [PRODUCTS.tv, PRODUCTS.cable, PRODUCTS.install];
  for (const [i, component] of components.entries()) {
    await tour.click(composition.getByRole("button", { name: t("products:bundle.addComponent") }));
    await tour.pick(composition.getByTestId("bundle-component-row").nth(i), component.designation, {
      search: component.reference,
    });
  }
  await tour.click(composition.getByRole("button", { name: t("products:bundle.save") }), { settleMs: 1200 });
  await tour.expectToast();

  await tour.say(
    "La fiche compare la valeur des composants au prix du pack : la remise se voit tout de suite."
  );
  await expect(composition.getByText(t("products:bundle.discount"))).toBeVisible();
  await tour.pause(1500);
  await tour.click(tour.dialog().getByRole("button", { name: t("common:buttons.cancel"), exact: true }), {
    settleMs: 900,
  });
  await expect(tour.row(PRODUCTS.pack.designation)).toContainText(t("products:types.bundle"));
  await tour.say(
    "Dans la liste, le stock du pack est ce que ses composants permettent d'assembler. Vendu, il les sortira du stock un par un."
  );

  await tour.say("Le catalogue est prêt : nous pouvons commencer à vendre.");
});
