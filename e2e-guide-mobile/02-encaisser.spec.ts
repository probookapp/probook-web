import { test, expect } from "@playwright/test";
import { Tour } from "../e2e-guide/lib/tour";
import { resume } from "../e2e-guide/lib/session";
import { t } from "../e2e-guide/lib/i18n";
import { CLIENT } from "../e2e-guide/lib/data";

/**
 * Setup before the camera rolls, the same way resume() restores the session.
 *
 * The desktop guide settles its invoice in chapter 5, so the account arrives
 * here with nothing outstanding. Everything the viewer sees happen is real; only
 * the starting position is arranged.
 */
async function anUnpaidInvoice(page: import("@playwright/test").Page) {
  const clients = await page.evaluate(async () => {
    const r = await fetch("/api/clients", { credentials: "include" });
    return (await r.json()) as { id: string; name: string }[];
  });
  const client = clients.find((c) => c.name === CLIENT.name) ?? clients[0];

  await page.evaluate(async (clientId) => {
    const create = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        client_id: clientId,
        issue_date: "2026-06-01",
        due_date: "2026-07-01",
        lines: [
          { description: "Maintenance trimestrielle", quantity: 1, unit_price: 18000, tax_rate: 19 },
        ],
      }),
    });
    const invoice = await create.json();
    await fetch(`/api/invoices/${invoice.id}/issue`, { method: "POST", credentials: "include" });
  }, client.id);
}

test("Mobile 2 — Retrouver une facture et encaisser", async ({ page }) => {
  const tour = await Tour.open(page, "2 · Encaisser");
  await resume(page, "dashboard");
  await anUnpaidInvoice(page);
  await page.reload();
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await tour.titleCard("Encaisser", "Le client paie, vous êtes en déplacement");

  // ─── depuis le tableau de bord ───
  await tour.say(
    "Le tableau de bord répond à la première question du matin : combien reste-t-il à encaisser ?"
  );
  await tour.pause(1600);
  await tour.say("Le chiffre est cliquable : il ouvre directement les factures non réglées.");
  await tour.click(
    page.getByRole("link", { name: new RegExp(t("dashboard:stats.pending"), "i") }).first(),
    { settleMs: 2000 }
  );
  await expect(page).toHaveURL(/\/invoices\?status=ISSUED/);
  await tour.pause(1400);

  // ─── règlement ───
  await tour.say("On retrouve la facture en tapant le nom du client.");
  await tour.type(page.locator('input[name="invoice-search"]'), "Atlas");
  await tour.pause(1200);
  // La recherche ne laisse qu'une entrée : l'action visible est la sienne.
  await tour.click(tour.action(t("common:buttons.view")), { settleMs: 2000 });

  await tour.say("Le client règle : on enregistre le versement.");
  await tour.click(page.getByRole("button", { name: t("common:buttons.add"), exact: true }), {
    settleMs: 1200,
  });

  const payment = tour.dialog();
  await tour.say("Le montant proposé est le solde restant. Espèces, chèque, virement, carte.");
  await tour.choose(payment.locator('select[name="payment_method"]'), "especes");
  await tour.click(payment.getByRole("button", { name: t("common:payments.savePayment") }), {
    settleMs: 2400,
  });

  await tour.say(
    "La facture passe en « Payée » toute seule, et le tableau de bord se met à jour derrière."
  );
  await expect(page.getByText(t("invoices:status.PAID"), { exact: true }).first()).toBeVisible();
  await tour.pause(2000);
});
