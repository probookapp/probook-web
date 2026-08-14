import type { AlertsSummary } from "@/types";

export const DEMO_ALERTS_SUMMARY: AlertsSummary = {
  overdue_invoices: [],
  due_soon_invoices: [
    {
      id: "demo-alert-001",
      alert_type: "DUE_SOON",
      title: "Facture à échéance proche",
      message: "La facture FAC-2026-002 arrive à échéance dans 11 jours",
      document_type: "invoice",
      document_id: "demo-invoice-002",
      document_number: "FAC-2026-002",
      client_name: "EURL Sahara Négoce",
      amount: 74970,
      date: "2026-04-05",
      days: -11,
      severity: "warning",
    },
  ],
  expiring_quotes: [
    {
      id: "demo-alert-002",
      alert_type: "EXPIRING_QUOTE",
      title: "Devis bientôt expiré",
      message: "Le devis DEV-2026-002 expire dans 3 jours",
      document_type: "quote",
      document_id: "demo-quote-002",
      document_number: "DEV-2026-002",
      client_name: "SARL Numidia Bâtiment",
      amount: 59500,
      date: "2026-03-28",
      days: -3,
      severity: "warning",
    },
  ],
  expired_quotes: [],
  total_overdue_amount: 0,
  total_count: 2,
};
