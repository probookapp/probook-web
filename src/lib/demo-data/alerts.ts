import type { AlertsSummary } from "@/types";

export const DEMO_ALERTS_SUMMARY: AlertsSummary = {
  overdue_invoices: [],
  due_soon_invoices: [
    {
      id: "demo-alert-001",
      alert_type: "DUE_SOON",
      title: "Invoice due soon",
      message: "Invoice FAC-2026-002 is due in 11 days",
      document_type: "invoice",
      document_id: "demo-invoice-002",
      document_number: "FAC-2026-002",
      client_name: "Sahara Trading Co.",
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
      title: "Quote expiring soon",
      message: "Quote DEV-2026-002 expires in 3 days",
      document_type: "quote",
      document_id: "demo-quote-002",
      document_number: "DEV-2026-002",
      client_name: "Acme Corp",
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
