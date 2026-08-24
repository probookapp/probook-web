/**
 * What the guide has to show, and which chapter shows it.
 *
 * The guide is filmed from the same specs that test the interface, so a feature
 * with no chapter is a feature nobody watches *and* nobody exercises end to end.
 * This registry makes that failure loud: the test beside it refuses to pass when
 * a page exists in the application and appears nowhere here.
 *
 * Adding a feature therefore means adding a line here and a step to a chapter —
 * which is the point. The inventory is a contract, not documentation.
 */
export interface GuideFeature {
  /** The route it lives at, relative to the locale prefix. */
  route: string;
  /** What a viewer would call it. */
  label: string;
  /** Chapter file (without the .spec.ts), or null when deliberately not filmed. */
  chapter: string | null;
  /** Why, when it is not filmed. */
  reason?: string;
}

export const GUIDE_FEATURES: GuideFeature[] = [
  { route: "dashboard", label: "Tableau de bord", chapter: "01-demarrage" },
  { route: "clients", label: "Fichier clients", chapter: "02-clients" },
  { route: "products", label: "Catalogue produits", chapter: "03-produits" },
  { route: "quotes", label: "Devis", chapter: "04-devis" },
  { route: "quotes/new", label: "Rédaction d'un devis", chapter: "04-devis" },
  { route: "quotes/[id]", label: "Consultation d'un devis", chapter: "04-devis" },
  { route: "quotes/[id]/edit", label: "Modification d'un devis", chapter: "04-devis" },
  { route: "invoices", label: "Factures", chapter: "05-factures" },
  { route: "invoices/new", label: "Rédaction d'une facture", chapter: "05-factures" },
  { route: "invoices/[id]", label: "Consultation d'une facture", chapter: "05-factures" },
  { route: "invoices/[id]/edit", label: "Modification d'une facture", chapter: "05-factures" },
  { route: "invoices/credit-notes", label: "Avoirs", chapter: "05-factures" },
  {
    route: "invoices/credit-notes/[id]",
    label: "Consultation d'un avoir",
    chapter: "05-factures",
  },
  { route: "pos", label: "Caisse", chapter: "06-caisse" },
  { route: "suppliers", label: "Fournisseurs", chapter: "07-achats" },
  { route: "purchases", label: "Bons de commande", chapter: "07-achats" },
  { route: "locations", label: "Emplacements et transferts", chapter: "08-stock" },
  { route: "delivery-notes", label: "Bons de livraison", chapter: "09-livraisons-depenses" },
  {
    route: "delivery-notes/new",
    label: "Rédaction d'un bon de livraison",
    chapter: "09-livraisons-depenses",
  },
  {
    route: "delivery-notes/[id]",
    label: "Consultation d'un bon de livraison",
    chapter: "09-livraisons-depenses",
  },
  {
    route: "delivery-notes/[id]/edit",
    label: "Modification d'un bon de livraison",
    chapter: "09-livraisons-depenses",
  },
  { route: "expenses", label: "Dépenses et postes de charge", chapter: "09-livraisons-depenses" },
  { route: "reports", label: "Rapports", chapter: "10-rapports" },
  { route: "settings", label: "Paramètres de l'entreprise", chapter: "11-parametres" },
  { route: "phonebook", label: "Annuaire", chapter: "02-clients" },
];

/**
 * Features that are not a page of their own but that the guide must still show,
 * because they are what a prospect asks about.
 */
export interface GuideTopic {
  label: string;
  chapter: string;
  /** A string the chapter's source must contain, so the claim is checkable. */
  evidence: string;
}

export const GUIDE_TOPICS: GuideTopic[] = [
  { label: "Création du compte", chapter: "01-demarrage", evidence: "goto(\"signup\")" },
  { label: "Remise commerciale", chapter: "04-devis", evidence: "discount_percent" },
  { label: "Marge en direct", chapter: "04-devis", evidence: "quotes:margin.label" },
  { label: "Devis converti en facture", chapter: "04-devis", evidence: "convertToInvoice" },
  { label: "Encaissement d'une facture", chapter: "05-factures", evidence: "payments.savePayment" },
  { label: "Avoir", chapter: "05-factures", evidence: "creditNotes.create" },
  { label: "Filtrer par état", chapter: "05-factures", evidence: "common:status.paid" },
  { label: "Archiver un document soldé", chapter: "05-factures", evidence: "common:buttons.archive" },
  { label: "Vente au comptoir", chapter: "06-caisse", evidence: "pos:searchProducts" },
  { label: "Modes de règlement", chapter: "06-caisse", evidence: "pos:cheque" },
  { label: "Réception d'une commande", chapter: "07-achats", evidence: "purchases:" },
  { label: "Transfert entre emplacements", chapter: "08-stock", evidence: "locations:" },
  { label: "Poste de dépense", chapter: "09-livraisons-depenses", evidence: "categories.manage" },
  { label: "Pilotage de l'activité", chapter: "10-rapports", evidence: "pipeline.title" },
  { label: "Dépenses par poste", chapter: "10-rapports", evidence: "expensesByCategory.title" },
  { label: "Récapitulatif TVA", chapter: "10-rapports", evidence: "taxSummary.title" },
  { label: "Export comptable", chapter: "10-rapports", evidence: "accountingExport.title" },
  { label: "Régime fiscal", chapter: "11-parametres", evidence: "fiscal_profile" },
  { label: "Comptes employés", chapter: "11-parametres", evidence: "employee" },
  { label: "Les trois offres", chapter: "12-abonnement", evidence: "landing.pricing.perMonth" },
  { label: "Composer son abonnement", chapter: "12-abonnement", evidence: "composer.open" },
  { label: "Places sur l'abonnement", chapter: "12-abonnement", evidence: "composer.seatsLegend" },
];

/**
 * The phone guide is its own set of chapters (e2e-guide-mobile), filmed
 * portrait. It shows fewer subjects on purpose — what someone actually does
 * standing up — but each one still has to prove it is in the chapter.
 */
export const MOBILE_TOPICS: GuideTopic[] = [
  { label: "Devis chez le client", chapter: "01-devis-terrain", evidence: "quotes:newQuote" },
  { label: "Éditeur de lignes replié", chapter: "01-devis-terrain", evidence: "li > button" },
  { label: "Feuille d'édition d'une ligne", chapter: "01-devis-terrain", evidence: "lines.doneLine" },
  { label: "Marge et remise sur le terrain", chapter: "01-devis-terrain", evidence: "discount_percent" },
  { label: "Tableau de bord cliquable", chapter: "02-encaisser", evidence: "status=ISSUED" },
  { label: "Encaisser en déplacement", chapter: "02-encaisser", evidence: "payments.savePayment" },
  { label: "Vue compacte de la caisse", chapter: "03-comptoir", evidence: "pos:compactView" },
  { label: "Modes de règlement", chapter: "03-comptoir", evidence: "pos:cheque" },
  { label: "Dépense saisie sur le pouce", chapter: "04-pilotage", evidence: "category_name" },
  { label: "Pilotage depuis le téléphone", chapter: "04-pilotage", evidence: "pipeline.title" },
];
