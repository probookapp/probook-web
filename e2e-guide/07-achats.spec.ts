import { test, expect } from "./lib/test";
import { Tour } from "./lib/tour";
import { resume } from "./lib/session";
import { t } from "./lib/i18n";
import { CLIENT_2, PRODUCTS, SUPPLIER } from "./lib/data";

/** What the order below buys, and therefore what the restock list must ask for. */
const TV_TO_ORDER = 10;

/**
 * A quote for more televisions than the shelf holds, written off camera.
 *
 * The restock list only shows a shortfall, and the earlier chapters leave
 * enough stock for every quote they write. Sizing it from the live stock keeps
 * the missing quantity at exactly what the order buys, whatever the till and
 * the credit note did to the count before this chapter.
 */
async function aQuoteTheShelfCannotCover(page: import("@playwright/test").Page) {
  await page.evaluate(
    async ({ clientName, tv, extra }) => {
      const get = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json());
      const clients: { id: string; name: string }[] = await get("/api/clients");
      const products: { id: string; reference: string | null; quantity: number }[] =
        await get("/api/products");
      const client = clients.find((c) => c.name === clientName)!;
      const product = products.find((p) => p.reference === tv.reference)!;
      const today = new Date();
      const in30 = new Date(today.getTime() + 30 * 86_400_000);
      await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          client_id: client.id,
          issue_date: today.toISOString().slice(0, 10),
          validity_date: in30.toISOString().slice(0, 10),
          status: "SENT",
          lines: [
            {
              description: tv.designation,
              quantity: product.quantity + extra,
              unit_price: Number(tv.salePrice),
              tax_rate: 19,
              product_id: product.id,
            },
          ],
        }),
      });
    },
    { clientName: CLIENT_2.name, tv: PRODUCTS.tv, extra: TV_TO_ORDER }
  );
}

test("Chapitre 7 — Fournisseurs et réapprovisionnement", async ({ page }) => {
  const tour = await Tour.open(page, "7 · Achats");
  await resume(page, "suppliers");
  await aQuoteTheShelfCannotCover(page);
  await page.goto(page.url().replace(/\/suppliers.*$/, "/quotes"));
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await tour.titleCard("Les achats", "Chapitre 7 — fournisseurs, commandes, réception");

  // ─── liste de réapprovisionnement ───
  await tour.say(
    "Le stock baisse, et un client vient de demander plus de téléviseurs qu'il n'en reste en rayon. Combien faut-il commander ?"
  );
  await tour.say(
    "Un devis ne réserve pas le stock : on peut chiffrer ce qu'on n'a pas encore. Probook additionne alors, en haut des devis, ce qui manque pour tous les honorer."
  );
  await tour.click(tour.button(t("quotes:restock.show")), { settleMs: 1200 });
  await expect(
    page.getByText(t("quotes:restock.toBuy").replace("{{count}}", String(TV_TO_ORDER)))
  ).toBeVisible();
  await tour.say(
    "Pour chaque article : ce que les devis demandent, ce qu'il y a en rayon, et la quantité à acheter — ici dix téléviseurs, avec le devis qui les attend."
  );
  await tour.pause(2400);

  // ─── fournisseur ───
  await tour.say("Commençons par créer le fournisseur.");
  await tour.nav("/suppliers");
  await tour.click(tour.button(t("suppliers:newSupplier")));

  const form = tour.dialog();
  await tour.type(form.locator('input[name="name"]'), SUPPLIER.name);
  await tour.type(form.locator('input[name="email"]'), SUPPLIER.email);
  await tour.type(form.locator('input[name="phone"]'), SUPPLIER.phone);
  await tour.type(form.locator('textarea[name="address"]'), SUPPLIER.address);
  await tour.click(form.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 1400,
  });
  await expect(tour.row(SUPPLIER.name)).toBeVisible();

  // ─── bon de commande ───
  await tour.say("On lui passe maintenant un bon de commande.");
  await tour.nav("/purchases");
  await tour.click(tour.button(t("purchases:newPurchase")), { settleMs: 1200 });

  // The order is written on its own page, like a quote or a delivery note.
  const order = page.locator("main");
  await tour.pick(tour.fieldByLabel(`${t("purchases:fields.supplier")} *`, order), SUPPLIER.name);

  await tour.say("On commande des téléviseurs. Le prix d'achat connu est repris automatiquement.");
  await tour.pick(
    tour.fieldByLabel(`${t("purchases:fields.product")} *`, order),
    PRODUCTS.tv.designation,
    { search: PRODUCTS.tv.search }
  );
  await tour.set(order.locator('input[name="lines.0.quantity"]'), "10");

  await tour.say("Le fournisseur a augmenté ses tarifs : on saisit le nouveau prix.");
  await tour.set(order.locator('input[name="lines.0.unit_price"]'), "34500");

  await tour.say("Probook rappelle l'ancien prix et propose de recalculer le prix moyen pondéré.");
  await tour.pause(1800);

  await tour.say("Ajoutons une deuxième référence à la même commande.");
  await tour.click(order.getByRole("button", { name: t("purchases:fields.addLine") }));
  await tour.pick(
    tour.fieldByLabel(`${t("purchases:fields.product")} *`, order, 1),
    PRODUCTS.cable.designation,
    { search: "HDMI" }
  );
  await tour.set(order.locator('input[name="lines.1.quantity"]'), "50");

  // ─── nouveau produit depuis la commande ───
  await tour.say(
    "Le fournisseur propose aussi une nouveauté qui n'est pas encore au catalogue. Pas besoin de quitter la commande : on la crée d'ici."
  );
  await tour.click(order.getByRole("button", { name: t("purchases:fields.addLine") }));
  await tour.click(
    order.getByRole("button", { name: t("purchases:newProduct.button") }).last(),
    { settleMs: 1200 }
  );

  // The product form opens over the order; `tour.dialog()` is the topmost one.
  const newProduct = tour.dialog();
  await tour.type(newProduct.locator('input[name="designation"]'), PRODUCTS.soundbar.designation);
  await tour.type(newProduct.locator('input[name="reference"]'), PRODUCTS.soundbar.reference);
  await tour.set(newProduct.locator('input[name="unit_price"]'), PRODUCTS.soundbar.salePrice);
  await tour.set(newProduct.locator('input[name="purchase_price"]'), PRODUCTS.soundbar.purchasePrice);
  await tour.say(
    "Pas de quantité à saisir ici : le stock arrivera avec la réception de la commande."
  );
  await expect(newProduct.locator('input[name="quantity"]')).toHaveCount(0);
  await tour.click(
    newProduct.getByRole("button", { name: t("products:createProduct"), exact: true }),
    { settleMs: 1600 }
  );

  await tour.say("Le produit est créé et déjà placé sur la ligne, avec son prix d'achat.");
  await expect(
    tour.fieldByLabel(`${t("purchases:fields.product")} *`, order, 2).locator("button").first()
  ).toContainText(PRODUCTS.soundbar.designation);
  await tour.set(order.locator('input[name="lines.2.quantity"]'), "6");
  await tour.pause(1200);

  await tour.click(order.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 1800,
  });
  await tour.say("Le bon de commande est enregistré, en attente de réception.");
  await expect(order.getByText(SUPPLIER.name).first()).toBeVisible();

  // ─── réception ───
  await tour.say(
    "La marchandise arrive. La réception est l'étape qui fait entrer les quantités en stock."
  );
  await tour.click(tour.button(t("purchases:actions.confirm")), { settleMs: 1400 });

  const receive = tour.dialog();
  await tour.say(
    "On peut réceptionner partiellement : ici le fournisseur n'a livré que 8 téléviseurs sur 10."
  );
  await tour.set(receive.locator('input[type="number"]').first(), "8");
  await tour.pause(1200);

  await tour.click(receive.getByRole("button", { name: t("purchases:confirmModal.confirm") }), {
    settleMs: 2200,
  });

  await tour.say("La commande passe en « partiellement reçu » et le stock a été crédité.");
  await tour.pause(1600);

  // ─── contrôle du stock ───
  await tour.nav("/products");
  await tour.say("Vérifions : le stock du téléviseur a bien augmenté de 8 unités.");
  await tour.point(tour.row(PRODUCTS.tv.designation));
  await tour.pause(2000);

  // ─── crédit fournisseur ───
  await tour.say("Reste à suivre ce que l'on doit au fournisseur.");
  await tour.nav("/suppliers");
  await tour.clickRowAction(SUPPLIER.name, t("suppliers:credits.title"), {
    settleMs: 1800,
  });

  await tour.say("Achats reçus, montant réglé et solde, avec ce qui reste à payer sur chaque commande.");
  await tour.pause(2400);

  // ─── retour de marchandise (avoir fournisseur) ───
  await tour.say(
    "Deux téléviseurs sont arrivés abîmés. On les renvoie au fournisseur, qui garde leur valeur comme un versement."
  );
  await tour.click(tour.dialog().getByRole("button", { name: t("suppliers:credits.returnGoods") }), {
    settleMs: 1600,
  });

  // The return is written on its own page, supplier already chosen.
  const ret = page.locator("main");
  const orderPicker = ret.locator('select[name="return-order"]');
  await expect(orderPicker.locator("option")).toHaveCount(2);
  const orderValue = await orderPicker.locator("option").nth(1).getAttribute("value");
  await tour.say("On part de la commande : Probook sait ce qui a été reçu et ce qui peut repartir.");
  await tour.choose(orderPicker, { value: orderValue ?? "" });
  await tour.set(ret.locator('input[name^="return-qty-"]').first(), "2");
  await tour.type(ret.locator('input[name="return-reason"]'), "Écrans abîmés au transport");
  await tour.pause(1200);
  await tour.click(ret.getByRole("button", { name: t("common:buttons.create"), exact: true }), {
    settleMs: 1800,
  });
  await expect(ret.getByText(t("purchases:returns.lines"))).toBeVisible();
  await tour.say("Les deux téléviseurs sortent du stock, et leur valeur vient en déduction de ce que l'on doit.");
  await tour.pause(1600);

  // ─── ajustement et relevé ───
  await tour.nav("/suppliers");
  await tour.clickRowAction(SUPPLIER.name, t("suppliers:credits.title"), { settleMs: 1600 });
  await tour.say(
    "Le fournisseur accorde aussi une remise par téléphone : on ajuste le solde, toujours avec un motif."
  );
  await tour.click(tour.dialog().getByRole("button", { name: t("suppliers:credits.adjust") }), {
    settleMs: 1000,
  });
  const adjust = tour.dialog();
  await tour.set(adjust.locator('input[name="adjustment-amount"]'), "5000");
  await tour.type(adjust.locator('textarea[name="adjustment-reason"]'), "Remise commerciale accordée");
  await tour.click(adjust.getByRole("button", { name: t("suppliers:adjustment.save") }), {
    settleMs: 1600,
  });

  await tour.say(
    "Le relevé reprend tout, ligne par ligne : achats, paiements, retours et ajustements, avec le solde au fil de l'eau."
  );
  await tour.click(tour.dialog().getByRole("button", { name: t("suppliers:credits.viewStatement") }), {
    settleMs: 1600,
  });
  await expect(tour.dialog().getByText(t("suppliers:statement.types.return")).first()).toBeAttached();
  await tour.say(
    "Si l'on a payé plus que ce que l'on doit, le solde passe en crédit en votre faveur, chez le fournisseur."
  );
  await tour.pause(2400);
});
